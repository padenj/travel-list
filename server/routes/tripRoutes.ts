import { Router, Request, Response } from 'express';
import { TripRepository } from '../repositories/tripRepository';
import { TripElementRepository } from '../repositories/tripElementRepository';
import { TripElementConfirmationRepository } from '../repositories/tripElementConfirmationRepository';
import { TripParticipantRepository } from '../repositories/tripParticipantRepository';
import { BookingRepository, BookingConflictError, pickBookingInput } from '../repositories/bookingRepository';
import { LodgingRoomRepository, RoomConflictError } from '../repositories/lodgingRoomRepository';
import { StayService } from '../services/stayService';
import { BookingService } from '../services/bookingService';
import { parseFirstTransaction } from '../utils/firstTransaction';
import { BookingTransactionRepository } from '../repositories/bookingTransactionRepository';
import { PaymentMethodRepository } from '../repositories/paymentMethodRepository';
import { FlightTravelerSeatRepository } from '../repositories/flightTravelerSeatRepository';
import { authMiddleware } from '../middleware';
import { tripAccessMiddleware } from '../middleware/tripAccessMiddleware';
import { lookupFlightStatsAutofill } from '../services/flightStatsLookupService';
import { getDb } from '../db';
import { PackingListRepository } from '../repositories';
import {
  TripDestinationRepository,
  DestinationConflictError,
  DestinationValidationError,
} from '../repositories/tripDestinationRepository';
import { splitListIntoTrip, notify } from '../services/tripSplitService';
import {
  createDestination,
  updateDestination,
  deleteDestinationTx,
  LastDestinationError,
  createTripWithFirstDestination,
  applyTripRenameTx,
  copyTrip,
} from '../services/tripListService';
import { withTransaction } from '../utils/transaction';
import { validateStay, validateRoom, validateBookingFields } from '../utils/lodgingValidation';

export const tripRouter = Router();

const tripRepository = new TripRepository();
const tripElementRepository = new TripElementRepository();
const tripElementConfirmationRepository = new TripElementConfirmationRepository();
const tripParticipantRepository = new TripParticipantRepository();
const bookingRepository = new BookingRepository();
const bookingTransactionRepository = new BookingTransactionRepository();
const paymentMethodRepository = new PaymentMethodRepository();
const flightTravelerSeatRepository = new FlightTravelerSeatRepository();
const lodgingRoomRepository = new LodgingRoomRepository();
const stayService = new StayService();
const bookingService = new BookingService();

const tripDestinationRepository = new TripDestinationRepository();
const packingListRepository = new PackingListRepository();

function sendDestinationError(res: Response, error: unknown, fallback: string) {
  if (error instanceof DestinationConflictError) {
    return res.status(409).json({ error: 'member_in_other_destination', memberId: error.memberId, destinationId: error.destinationId });
  }
  if (error instanceof LastDestinationError) {
    return res.status(409).json({ error: 'last_destination' });
  }
  if (error instanceof DestinationValidationError) {
    return res.status(error.message === 'not_found' ? 404 : 400).json({ error: error.message });
  }
  return res.status(500).json({ error: fallback });
}

// List trips for authenticated user's family
tripRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const trips = await tripRepository.getTripsByFamily((req as any).user.familyId);
    res.json(trips);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// Create trip (dates optional); it starts with one destination named after it
tripRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description, tripType, startDate, endDate, status, memberIds } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }
    const familyId = (req as any).user.familyId;
    let members: string[] = Array.isArray(memberIds) ? memberIds : [];
    if (members.length === 0) {
      const db = await getDb();
      members = ((await db.all(`SELECT id FROM users WHERE familyId = ? AND deleted_at IS NULL`, [familyId])) as { id: string }[])
        .map(u => u.id);
    }
    const { tripId } = await createTripWithFirstDestination({
      familyId,
      name: name.trim(),
      description,
      tripType,
      startDate,
      endDate,
      status,
      memberIds: members,
    });
    res.status(201).json(await tripRepository.getTripById(tripId));
  } catch (error) {
    if (error instanceof DestinationValidationError) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

// Get trip detail
tripRouter.get('/:tripId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const trip = await tripRepository.getTripById(req.trip!.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trip' });
  }
});

// Update trip; a new name flows to destinations that carried the old one and to every list label
tripRouter.put('/:tripId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  const body = req.body || {};
  if ('name' in body && (typeof body.name !== 'string' || !body.name.trim())) {
    return res.status(400).json({ error: 'name must be a non-empty string' });
  }
  try {
    const db = await getDb();
    const oldName = req.trip!.name;
    const updates = 'name' in body ? { ...body, name: body.name.trim() } : body;
    const changed = await withTransaction(db, async () => {
      await tripRepository.updateTrip(req.trip!.id, updates);
      return 'name' in updates && updates.name !== oldName
        ? applyTripRenameTx(db, req.trip!.id, oldName, updates.name)
        : [];
    });
    notify(changed, 'destination');
    res.json(await tripRepository.getTripById(req.trip!.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

// Delete trip with its destinations and lists
tripRouter.delete('/:tripId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const lists = (await tripDestinationRepository.listForTrip(req.trip!.id)).map(d => d.packingListId);
    await tripRepository.deleteTrip(req.trip!.id);
    notify(lists, 'destination');
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

// Copy a trip's destinations and lists into a new dateless trip
tripRouter.post('/:tripId/copy', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  const { name, includeOneOffs } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const tripId = await copyTrip({
      sourceTripId: req.trip!.id,
      familyId: req.trip!.family_id,
      name: name.trim(),
      includeOneOffs: includeOneOffs === true,
    });
    return res.status(201).json({
      trip: await tripRepository.getTripById(tripId),
      destinations: await tripDestinationRepository.listForTrip(tripId),
    });
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to copy trip');
  }
});

// List elements for trip
tripRouter.get('/:tripId/elements', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const elements = await tripElementRepository.getElementsByTrip(req.trip!.id);
    res.json(elements);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch elements' });
  }
});

// Lookup flight details from FlightStats (POC)
tripRouter.post('/:tripId/flight-autofill', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const { airlineCode, flightNumber, flightDate } = req.body || {};
    if (!airlineCode || !flightNumber || !flightDate) {
      return res.status(400).json({ error: 'Missing required fields: airlineCode, flightNumber, flightDate' });
    }

    const details = await lookupFlightStatsAutofill({
      airlineCode: String(airlineCode),
      flightNumber: String(flightNumber),
      flightDate: String(flightDate),
    });
    return res.json(details);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Flight lookup failed';
    return res.status(502).json({ error: message });
  }
});

const BOOKING_KIND_ERROR = 'A booking covers flights only, or exactly one stay';

async function bookingKind(elementIds: string[]): Promise<'flight' | 'hotel' | 'invalid'> {
  const types: string[] = [];
  for (const id of new Set(elementIds)) {
    const el = await tripElementRepository.getElementById(id);
    if (!el) return 'invalid';
    types.push(el.elementType);
  }
  if (types.length > 0 && types.every(t => t === 'flight')) return 'flight';
  if (types.length === 1 && types[0] === 'hotel') return 'hotel';
  return 'invalid';
}

async function checkStayDestination(tripId: string, destinationId: unknown): Promise<boolean> {
  if (destinationId == null || destinationId === '') return true;
  const db = await getDb();
  const row = await db.get(
    'SELECT id FROM trip_destinations WHERE id = ? AND trip_id = ? AND deleted_at IS NULL',
    [destinationId, tripId]
  );
  return Boolean(row);
}

const STAY_HAS_BOOKING = 'This stay already has a booking';

// Stays own exactly one booking; returns an error if `elementId` is a stay already booked by another booking.
async function stayBookingError(elementId: string, bookingId: string | null): Promise<string | null> {
  const existing = await bookingRepository.getBookingIdForElement(elementId);
  return existing && existing !== bookingId ? STAY_HAS_BOOKING : null;
}

async function foreignTravelerError(tripId: string, travelerIds: unknown): Promise<string | null> {
  if (!Array.isArray(travelerIds)) return null;
  for (const id of travelerIds) {
    const p = await tripParticipantRepository.getParticipantById(id);
    if (!p || p.tripId !== tripId) return 'Traveler not found';
  }
  return null;
}

// Create element
tripRouter.post('/:tripId/elements', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const { elementType, name, bookingReference, bookingUrl, priceCash, pricePoints, loyaltyProgram, totalCash, totalPoints, notes, sortPosition, typeSpecificData } = req.body;
    if (!elementType || (!name && elementType !== 'flight')) {
      return res.status(400).json({ error: 'Missing required fields: elementType, name' });
    }
    if (elementType === 'hotel') {
      const stayError = validateStay({ name, ...(typeSpecificData ?? {}) }, { partial: false });
      if (stayError) return res.status(400).json({ error: stayError });
      if (!(await checkStayDestination(req.trip!.id, typeSpecificData?.destinationId))) {
        return res.status(404).json({ error: 'Destination not found' });
      }
      const bookingError = validateBookingFields(req.body.booking ?? {});
      if (bookingError) return res.status(400).json({ error: bookingError });
      const first = parseFirstTransaction(req.body.firstTransaction, req.body.booking ?? {});
      if (first.error) return res.status(400).json({ error: first.error });
      if (first.value) {
        const methodError = await paymentMethodError(req.trip!.family_id, first.value.paymentMethodId);
        if (methodError) return res.status(400).json({ error: methodError });
      }
      const stay = await stayService.createStay(req.trip!.id, {
        name, notes, typeSpecificData, booking: pickBookingInput(req.body.booking ?? {}), firstTransaction: first.value,
      });
      return res.status(201).json(stay);
    }
    const element = await tripElementRepository.createElement(req.trip!.id, {
      elementType,
      name,
      bookingReference,
      bookingUrl,
      priceCash,
      pricePoints,
      loyaltyProgram,
      totalCash,
      totalPoints,
      notes,
      sortPosition,
      typeSpecificData,
    });
    res.status(201).json(element);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create element' });
  }
});

// Get element detail
tripRouter.get('/:tripId/elements/:elementId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Element not found' });
    }
    res.json(element);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch element' });
  }
});

// Update element
tripRouter.put('/:tripId/elements/:elementId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Element not found' });
    }
    if (element.elementType === 'hotel') {
      const { name, typeSpecificData, booking } = req.body ?? {};
      if (name !== undefined || typeSpecificData !== undefined) {
        const existing = {
          checkInDate: (element as any).hotelDetails?.checkInDate ?? null,
          checkOutDate: (element as any).hotelDetails?.checkOutDate ?? null,
        };
        const stayError = validateStay(
          { ...(name !== undefined ? { name } : {}), ...(typeSpecificData ?? {}) },
          { partial: true, existing }
        );
        if (stayError) return res.status(400).json({ error: stayError });
        if (typeSpecificData && !(await checkStayDestination(req.trip!.id, typeSpecificData.destinationId))) {
          return res.status(404).json({ error: 'Destination not found' });
        }
      }
      if (booking !== undefined) {
        const bookingError = validateBookingFields(booking);
        if (bookingError) return res.status(400).json({ error: bookingError });
      }
      const { booking: _ignored, firstTransaction: _notOnUpdate, ...elementUpdates } = req.body ?? {};
      const updated = await stayService.updateStay(req.trip!.id, element.id, {
        ...elementUpdates, ...(booking !== undefined ? { booking: pickBookingInput(booking) } : {}),
      });
      return res.json(updated);
    }
    const updated = await tripElementRepository.updateElement(req.params.elementId, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update element' });
  }
});

async function findRoomForTrip(tripId: string, roomId: string) {
  const room = await lodgingRoomRepository.getRoom(roomId);
  if (!room) return null;
  const element = await tripElementRepository.getElementById(room.elementId);
  return element && element.tripId === tripId ? room : null;
}

function sendRoomError(res: Response, error: unknown, fallback: string) {
  if (error instanceof RoomConflictError) return res.status(409).json({ error: error.message });
  return res.status(500).json({ error: fallback });
}

tripRouter.post('/:tripId/elements/:elementId/rooms', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id) return res.status(404).json({ error: 'Element not found' });
    if (element.elementType !== 'hotel') return res.status(400).json({ error: 'Rooms are only for stays' });
    const body = req.body ?? {};
    const roomError = validateRoom(body);
    if (roomError) return res.status(400).json({ error: roomError });
    const travelerError = await foreignTravelerError(req.trip!.id, body.travelerIds);
    if (travelerError) return res.status(404).json({ error: travelerError });
    const room = await lodgingRoomRepository.createRoom(element.id, {
      roomType: body.roomType, beds: body.beds, description: body.description,
      amenities: body.amenities, otherAmenities: body.otherAmenities, travelerIds: body.travelerIds,
    });
    res.status(201).json(room);
  } catch (error) {
    sendRoomError(res, error, 'Failed to add room');
  }
});

tripRouter.put('/:tripId/rooms/:roomId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const room = await findRoomForTrip(req.trip!.id, req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const body = req.body ?? {};
    const roomError = validateRoom(body);
    if (roomError) return res.status(400).json({ error: roomError });
    const travelerError = await foreignTravelerError(req.trip!.id, body.travelerIds);
    if (travelerError) return res.status(404).json({ error: travelerError });
    const input: Record<string, unknown> = {};
    for (const key of ['roomType', 'beds', 'description', 'amenities', 'otherAmenities', 'travelerIds']) {
      if (key in body) input[key] = body[key];
    }
    res.json(await lodgingRoomRepository.updateRoom(room.id, input));
  } catch (error) {
    sendRoomError(res, error, 'Failed to update room');
  }
});

tripRouter.delete('/:tripId/rooms/:roomId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const room = await findRoomForTrip(req.trip!.id, req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    await lodgingRoomRepository.deleteRoom(room.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Replace/update the legs of a flight element (update by id, insert new, delete missing)
tripRouter.put('/:tripId/elements/:elementId/legs', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id || element.elementType !== 'flight') {
      return res.status(404).json({ error: 'Flight element not found' });
    }
    const legs = req.body?.legs;
    if (!Array.isArray(legs)) {
      return res.status(400).json({ error: 'legs array is required' });
    }
    const saved = await tripElementRepository.syncLegs(req.params.elementId, legs);
    res.json(saved);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save legs' });
  }
});

// Delete element
tripRouter.delete('/:tripId/elements/:elementId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Element not found' });
    }
    await tripElementRepository.deleteElement(req.params.elementId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete element' });
  }
});

// Add confirmation to element
tripRouter.post('/:tripId/elements/:elementId/confirmations', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Element not found' });
    }
    const { confirmationNumber, label, legId, participantId } = req.body;
    if (!confirmationNumber) {
      return res.status(400).json({ error: 'Missing required field: confirmationNumber' });
    }
    const conf = await tripElementConfirmationRepository.addConfirmation(req.params.elementId, {
      confirmationNumber,
      label,
      legId,
      participantId,
    });
    res.status(201).json(conf);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add confirmation' });
  }
});

// Get confirmations for element
tripRouter.get('/:tripId/elements/:elementId/confirmations', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Element not found' });
    }
    const confirmations = await tripElementConfirmationRepository.getConfirmationsForElement(req.params.elementId);
    res.json(confirmations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch confirmations' });
  }
});

// Update confirmation
tripRouter.put('/:tripId/elements/:elementId/confirmations/:confirmationId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Element not found' });
    }
    const confirmations = await tripElementConfirmationRepository.getConfirmationsForElement(req.params.elementId);
    const confirmation = confirmations.find(c => c.id === req.params.confirmationId);
    if (!confirmation) {
      return res.status(404).json({ error: 'Confirmation not found' });
    }
    const updated = await tripElementConfirmationRepository.updateConfirmation(req.params.confirmationId, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update confirmation' });
  }
});

// Delete confirmation
tripRouter.delete('/:tripId/elements/:elementId/confirmations/:confirmationId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Element not found' });
    }
    const confirmations = await tripElementConfirmationRepository.getConfirmationsForElement(req.params.elementId);
    const confirmation = confirmations.find(c => c.id === req.params.confirmationId);
    if (!confirmation) {
      return res.status(404).json({ error: 'Confirmation not found' });
    }
    await tripElementConfirmationRepository.deleteConfirmation(req.params.confirmationId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete confirmation' });
  }
});

// ===== Participants =====

tripRouter.get('/:tripId/participants', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const participants = await tripParticipantRepository.getParticipantsForTrip(req.trip!.id);
    res.json(participants);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

tripRouter.post('/:tripId/participants', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const { displayName, userId } = req.body;
    if (!displayName) {
      return res.status(400).json({ error: 'Missing required field: displayName' });
    }
    const participant = await tripParticipantRepository.createParticipant(req.trip!.id, { displayName, userId });
    res.status(201).json(participant);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create participant' });
  }
});

tripRouter.patch('/:tripId/participants/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const participant = await tripParticipantRepository.getParticipantById(req.params.id);
    if (!participant || participant.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    const updated = await tripParticipantRepository.updateParticipant(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update participant' });
  }
});

tripRouter.delete('/:tripId/participants/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const participant = await tripParticipantRepository.getParticipantById(req.params.id);
    if (!participant || participant.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    await tripParticipantRepository.deleteParticipant(req.params.id);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete participant';
    res.status(409).json({ error: message });
  }
});

// ===== Bookings =====

// Returns an error message when any id does not belong to the trip.
async function findForeignBookingRef(tripId: string, elementIds: string[] = [], travelerIds: string[] = []): Promise<string | null> {
  for (const elementId of elementIds) {
    const element = await tripElementRepository.getElementById(elementId);
    if (!element || element.tripId !== tripId) return `Element not found: ${elementId}`;
  }
  for (const participantId of travelerIds) {
    const participant = await tripParticipantRepository.getParticipantById(participantId);
    if (!participant || participant.tripId !== tripId) return `Participant not found: ${participantId}`;
  }
  return null;
}

function sendBookingError(res: Response, error: unknown, fallback: string) {
  if (error instanceof BookingConflictError) {
    return res.status(409).json({ error: error.message });
  }
  return res.status(500).json({ error: fallback });
}

tripRouter.get('/:tripId/bookings', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const elementId = typeof req.query.elementId === 'string' ? req.query.elementId : undefined;
    const bookings = await bookingRepository.getBookingsForTrip(req.trip!.id, elementId);
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

tripRouter.post('/:tripId/bookings', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const { elementIds, travelerIds } = req.body;
    if (!Array.isArray(elementIds) || elementIds.length === 0) {
      return res.status(400).json({ error: 'At least one elementId is required' });
    }
    if (travelerIds !== undefined && !Array.isArray(travelerIds)) {
      return res.status(400).json({ error: 'travelerIds must be an array' });
    }
    const foreign = await findForeignBookingRef(req.trip!.id, elementIds, travelerIds);
    if (foreign) {
      return res.status(404).json({ error: foreign });
    }
    const kind = await bookingKind(elementIds);
    if (kind === 'invalid') {
      return res.status(400).json({ error: BOOKING_KIND_ERROR });
    }
    if (kind === 'flight' && (!travelerIds || travelerIds.length === 0)) {
      return res.status(400).json({ error: 'At least one travelerId is required' });
    }
    if (kind === 'hotel') {
      if (travelerIds?.length) return res.status(400).json({ error: 'Stay travelers are set on rooms' });
      const stayError = await stayBookingError(elementIds[0], null);
      if (stayError) return res.status(400).json({ error: stayError });
    }
    const fieldsError = validateBookingFields(req.body);
    if (fieldsError) return res.status(400).json({ error: fieldsError });
    const first = parseFirstTransaction(req.body.firstTransaction, req.body);
    if (first.error) return res.status(400).json({ error: first.error });
    if (first.value) {
      const methodError = await paymentMethodError(req.trip!.family_id, first.value.paymentMethodId);
      if (methodError) return res.status(400).json({ error: methodError });
    }
    const booking = await bookingService.createBooking(req.trip!.id, {
      ...pickBookingInput(req.body), elementIds, travelerIds: travelerIds ?? [],
    } as any, first.value);
    res.status(201).json(booking);
  } catch (error) {
    sendBookingError(res, error, 'Failed to create booking');
  }
});

tripRouter.get('/:tripId/bookings/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

tripRouter.patch('/:tripId/bookings/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const { elementIds, travelerIds } = req.body ?? {};
    if (elementIds !== undefined && (!Array.isArray(elementIds) || elementIds.length === 0)) {
      return res.status(400).json({ error: 'At least one elementId is required' });
    }
    if (travelerIds !== undefined && !Array.isArray(travelerIds)) {
      return res.status(400).json({ error: 'travelerIds must be an array' });
    }
    const foreign = await findForeignBookingRef(req.trip!.id, elementIds, travelerIds);
    if (foreign) {
      return res.status(404).json({ error: foreign });
    }
    // A booking whose elements are all soft-deleted has no kind left to enforce.
    const kindIds: string[] = elementIds ?? booking.elementIds;
    const kind = kindIds.length === 0 ? 'flight' : await bookingKind(kindIds);
    if (kind === 'invalid') {
      return res.status(400).json({ error: BOOKING_KIND_ERROR });
    }
    if (kind === 'flight' && travelerIds !== undefined && travelerIds.length === 0) {
      return res.status(400).json({ error: 'At least one travelerId is required' });
    }
    if (kind === 'hotel') {
      if (travelerIds?.length) return res.status(400).json({ error: 'Stay travelers are set on rooms' });
      if (elementIds !== undefined) {
        const stayError = await stayBookingError(elementIds[0], booking.id);
        if (stayError) return res.status(400).json({ error: stayError });
      }
    }
    const fieldsError = validateBookingFields(req.body ?? {});
    if (fieldsError) return res.status(400).json({ error: fieldsError });
    const updates: Record<string, unknown> = { ...pickBookingInput(req.body ?? {}) };
    if (elementIds !== undefined) updates.elementIds = elementIds;
    if (travelerIds !== undefined) updates.travelerIds = travelerIds;
    const updated = await bookingRepository.updateBooking(req.params.id, updates);
    res.json(updated);
  } catch (error) {
    sendBookingError(res, error, 'Failed to update booking');
  }
});

tripRouter.delete('/:tripId/bookings/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    await bookingRepository.deleteBooking(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

tripRouter.post('/:tripId/bookings/:id/elements', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const { elementId } = req.body;
    if (!elementId) {
      return res.status(400).json({ error: 'Missing required field: elementId' });
    }
    const element = await tripElementRepository.getElementById(elementId);
    if (!element || element.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Element not found' });
    }
    if ((await bookingKind([...booking.elementIds, elementId])) === 'invalid') {
      return res.status(400).json({ error: BOOKING_KIND_ERROR });
    }
    if (element.elementType === 'hotel') {
      const stayError = await stayBookingError(elementId, booking.id);
      if (stayError) return res.status(400).json({ error: stayError });
    }
    await bookingRepository.linkElement(req.params.id, elementId);
    res.json(await bookingRepository.getBookingById(req.params.id));
  } catch (error) {
    sendBookingError(res, error, 'Failed to link element to booking');
  }
});

tripRouter.delete('/:tripId/bookings/:id/elements/:elementId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    await bookingRepository.unlinkElement(req.params.id, req.params.elementId);
    res.json(await bookingRepository.getBookingById(req.params.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to unlink element from booking' });
  }
});

tripRouter.post('/:tripId/bookings/:id/travelers', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const { participantId } = req.body;
    if (!participantId) {
      return res.status(400).json({ error: 'Missing required field: participantId' });
    }
    const participant = await tripParticipantRepository.getParticipantById(participantId);
    if (!participant || participant.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    await bookingRepository.addTraveler(req.params.id, participantId);
    res.json(await bookingRepository.getBookingById(req.params.id));
  } catch (error) {
    sendBookingError(res, error, 'Failed to add traveler to booking');
  }
});

tripRouter.delete('/:tripId/bookings/:id/travelers/:participantId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    await bookingRepository.removeTraveler(req.params.id, req.params.participantId);
    res.json(await bookingRepository.getBookingById(req.params.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove traveler from booking' });
  }
});

// Returns an error message, or null when `value` is acceptable for this trip's family.
// An archived method is only accepted when it is the transaction's current method (`current`).
async function paymentMethodError(familyId: string, value: unknown, current: string | null = null): Promise<string | null> {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'Unknown payment method';
  const method = await paymentMethodRepository.getById(familyId, value);
  if (!method) return 'Unknown payment method';
  if (method.archived && value !== current) return 'Payment method is archived';
  return null;
}

const TRANSACTION_UPDATE_KEYS = ['amountCash', 'amountPoints', 'transactionDate', 'confirmationNumber', 'notes', 'paymentMethodId'] as const;

// ===== Booking transactions =====

tripRouter.get('/:tripId/bookings/:bookingId/transactions', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.bookingId);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const transactions = await bookingTransactionRepository.getTransactionsForBooking(req.params.bookingId);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

tripRouter.post('/:tripId/bookings/:bookingId/transactions', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.bookingId);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const { amountCash, amountPoints, transactionDate, confirmationNumber, notes, paymentMethodId } = req.body;
    const methodError = await paymentMethodError(req.trip!.family_id, paymentMethodId);
    if (methodError) return res.status(400).json({ error: methodError });
    const transaction = await bookingTransactionRepository.addTransaction(req.params.bookingId, {
      amountCash,
      amountPoints,
      transactionDate,
      confirmationNumber,
      notes,
      paymentMethodId,
    });
    res.status(201).json(transaction);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add transaction';
    res.status(400).json({ error: message });
  }
});

tripRouter.patch('/:tripId/bookings/:bookingId/transactions/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.bookingId);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const existing = await bookingTransactionRepository.getTransactionById(req.params.id);
    if (!existing || existing.bookingId !== req.params.bookingId) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const methodError = await paymentMethodError(req.trip!.family_id, req.body.paymentMethodId, existing.paymentMethodId);
    if (methodError) return res.status(400).json({ error: methodError });
    const updates: Record<string, unknown> = {};
    for (const key of TRANSACTION_UPDATE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) updates[key] = req.body[key];
    }
    const updated = await bookingTransactionRepository.updateTransaction(req.params.id, updates);
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update transaction';
    res.status(400).json({ error: message });
  }
});

tripRouter.delete('/:tripId/bookings/:bookingId/transactions/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.bookingId);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const transactions = await bookingTransactionRepository.getTransactionsForBooking(req.params.bookingId);
    if (!transactions.some((transaction) => transaction.id === req.params.id)) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    await bookingTransactionRepository.deleteTransaction(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// ===== Flight seats =====

tripRouter.get('/:tripId/legs/:legId/seats', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const ownership = await tripElementRepository.getLegOwnership(req.params.legId);
    if (!ownership || ownership.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Leg not found' });
    }
    const seats = await flightTravelerSeatRepository.getSeatsForLeg(req.params.legId);
    res.json(seats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch seats' });
  }
});

tripRouter.put('/:tripId/legs/:legId/seats/:participantId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const ownership = await tripElementRepository.getLegOwnership(req.params.legId);
    if (!ownership || ownership.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Leg not found' });
    }
    const participant = await tripParticipantRepository.getParticipantById(req.params.participantId);
    if (!participant || participant.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    const { seatNumber } = req.body;
    if (!seatNumber) {
      return res.status(400).json({ error: 'Missing required field: seatNumber' });
    }
    const seat = await flightTravelerSeatRepository.upsertSeat(req.params.legId, req.params.participantId, seatNumber);
    res.json(seat);
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign seat' });
  }
});

tripRouter.delete('/:tripId/legs/:legId/seats/:participantId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const ownership = await tripElementRepository.getLegOwnership(req.params.legId);
    if (!ownership || ownership.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Leg not found' });
    }
    await flightTravelerSeatRepository.deleteSeat(req.params.legId, req.params.participantId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove seat' });
  }
});

// Destinations: one packing list per group of travelers
tripRouter.get('/:tripId/destinations', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    res.json(await tripDestinationRepository.listForTrip(req.trip!.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch destinations' });
  }
});

tripRouter.post('/:tripId/destinations', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  const { name, memberIds, itemGroupIds, packingListId, moveFrom, sharedItemsTo } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!Array.isArray(memberIds) || memberIds.length === 0) return res.status(400).json({ error: 'memberIds is required' });
  if (sharedItemsTo !== undefined && sharedItemsTo !== 'existing' && sharedItemsTo !== 'new') {
    return res.status(400).json({ error: 'invalid_shared_items_to' });
  }
  const groupIds: string[] = Array.isArray(itemGroupIds) ? itemGroupIds : [];
  try {
    if (groupIds.length > 0) {
      const db = await getDb();
      const placeholders = groupIds.map(() => '?').join(',');
      const found = await db.all(
        `SELECT id FROM templates WHERE family_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
        [req.trip!.family_id, ...groupIds]
      );
      if (found.length !== new Set(groupIds).size) return res.status(400).json({ error: 'invalid_item_groups' });
    }
    const { destinationId, touchedListIds } = await createDestination({
      tripId: req.trip!.id,
      familyId: req.trip!.family_id,
      name: name.trim(),
      memberIds,
      packingListId: typeof packingListId === 'string' && packingListId ? packingListId : undefined,
      moveFrom: moveFrom === true,
      sharedItemsTo,
    });
    const destination = (await tripDestinationRepository.getById(destinationId))!;
    if (groupIds.length > 0) {
      const current = await packingListRepository.getTemplatesForPackingList(destination.packingListId);
      await packingListRepository.setTemplatesForPackingList(destination.packingListId, Array.from(new Set([...current, ...groupIds])));
      for (const groupId of groupIds) {
        await packingListRepository.reconcilePackingListAgainstTemplate(destination.packingListId, groupId);
      }
    }
    const tripLists = (await tripDestinationRepository.listForTrip(req.trip!.id)).map(d => d.packingListId);
    notify([...touchedListIds, ...tripLists], moveFrom === true ? 'move' : 'destination');
    return res.status(201).json(destination);
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to create destination');
  }
});

tripRouter.put('/:tripId/destinations/:destinationId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const existing = await tripDestinationRepository.getById(req.params.destinationId);
    if (!existing || existing.tripId !== req.trip!.id) return res.status(404).json({ error: 'Destination not found' });
    const { name, color, position, memberIds, moveFrom } = req.body || {};
    if (memberIds !== undefined && (!Array.isArray(memberIds) || memberIds.length === 0)) {
      return res.status(400).json({ error: 'memberIds must be a non-empty array' });
    }
    const touched = await updateDestination({
      destinationId: existing.id,
      familyId: req.trip!.family_id,
      name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
      color: typeof color === 'string' ? color : undefined,
      position: typeof position === 'number' ? position : undefined,
      memberIds,
      moveFrom: moveFrom === true,
    });
    notify(touched, moveFrom === true ? 'move' : 'destination');
    return res.json(await tripDestinationRepository.getById(existing.id));
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to update destination');
  }
});

tripRouter.delete('/:tripId/destinations/:destinationId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const existing = await tripDestinationRepository.getById(req.params.destinationId);
    if (!existing || existing.tripId !== req.trip!.id) return res.status(404).json({ error: 'Destination not found' });
    const { moveSharedItemsTo, deleteList } = req.body || {};
    const siblings = await tripDestinationRepository.listForTrip(existing.tripId);
    if (siblings.length <= 1) return res.status(409).json({ error: 'last_destination' });
    const db = await getDb();
    const { count } = await db.get(`SELECT COUNT(*) AS count FROM packing_list_items WHERE packing_list_id = ?`, [existing.packingListId]);
    if (count > 0 && !moveSharedItemsTo && !deleteList) {
      return res.status(409).json({ error: 'destination_has_items', itemCount: count });
    }
    let target: Awaited<ReturnType<typeof tripDestinationRepository.getById>> | null = null;
    if (moveSharedItemsTo) {
      target = await tripDestinationRepository.getById(moveSharedItemsTo);
      if (!target || target.tripId !== existing.tripId || target.id === existing.id) {
        return res.status(400).json({ error: 'invalid_target_destination' });
      }
    }
    const moved = await withTransaction(db, () =>
      deleteDestinationTx(db, {
        destination: existing,
        familyId: req.trip!.family_id,
        moveSharedItemsToListId: target ? target.packingListId : null,
        deleteList: deleteList === true,
      })
    );
    const remainingLists = (await tripDestinationRepository.listForTrip(existing.tripId)).map(d => d.packingListId);
    notify([existing.packingListId, ...remainingLists], moved > 0 ? 'move' : 'destination');
    return res.status(204).send();
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to delete destination');
  }
});

tripRouter.post('/:tripId/split', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  const { sourceListId, destinations, sharedItemsDestinationIndex } = req.body || {};
  if (typeof sourceListId !== 'string' || !sourceListId) return res.status(400).json({ error: 'sourceListId is required' });
  try {
    const result = await splitListIntoTrip({
      tripId: req.trip!.id,
      tripName: req.trip!.name,
      familyId: req.trip!.family_id,
      sourceListId,
      destinations,
      sharedItemsDestinationIndex: Number(sharedItemsDestinationIndex ?? 0),
    });
    return res.status(201).json(result);
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to split list');
  }
});
