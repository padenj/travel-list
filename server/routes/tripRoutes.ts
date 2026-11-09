import { Router, Request, Response } from 'express';
import { TripRepository } from '../repositories/tripRepository';
import { TripElementRepository } from '../repositories/tripElementRepository';
import { TripElementConfirmationRepository } from '../repositories/tripElementConfirmationRepository';
import { TripParticipantRepository } from '../repositories/tripParticipantRepository';
import { BookingRepository, BookingConflictError } from '../repositories/bookingRepository';
import { BookingTransactionRepository } from '../repositories/bookingTransactionRepository';
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
import { splitListIntoTrip, moveAllSharedItemsTx, notify } from '../services/tripSplitService';
import { withTransaction } from '../utils/transaction';

export const tripRouter = Router();

const tripRepository = new TripRepository();
const tripElementRepository = new TripElementRepository();
const tripElementConfirmationRepository = new TripElementConfirmationRepository();
const tripParticipantRepository = new TripParticipantRepository();
const bookingRepository = new BookingRepository();
const bookingTransactionRepository = new BookingTransactionRepository();
const flightTravelerSeatRepository = new FlightTravelerSeatRepository();

const tripDestinationRepository = new TripDestinationRepository();
const packingListRepository = new PackingListRepository();

function sendDestinationError(res: Response, error: unknown, fallback: string) {
  if (error instanceof DestinationConflictError) {
    return res.status(409).json({ error: 'member_in_other_destination', memberId: error.memberId, destinationId: error.destinationId });
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

// Create trip
tripRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description, tripType, startDate, endDate, status } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields: name, startDate, endDate' });
    }
    const trip = await tripRepository.createTrip((req as any).user.familyId, {
      name,
      description,
      tripType,
      startDate,
      endDate,
      status,
    });
    res.status(201).json(trip);
  } catch (error) {
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

// Update trip
tripRouter.put('/:tripId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const trip = await tripRepository.updateTrip(req.trip!.id, req.body);
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

// Delete trip
tripRouter.delete('/:tripId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    await tripRepository.deleteTrip(req.trip!.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete trip' });
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

// Create element
tripRouter.post('/:tripId/elements', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const { elementType, name, bookingReference, bookingUrl, priceCash, pricePoints, loyaltyProgram, totalCash, totalPoints, notes, sortPosition, typeSpecificData } = req.body;
    if (!elementType || (!name && elementType !== 'flight')) {
      return res.status(400).json({ error: 'Missing required fields: elementType, name' });
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
    const updated = await tripElementRepository.updateElement(req.params.elementId, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update element' });
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
    const { confirmationNumber, advertisedPriceCash, advertisedPricePoints, loyaltyProgram, notes, elementIds, travelerIds } = req.body;
    if (!Array.isArray(elementIds) || elementIds.length === 0) {
      return res.status(400).json({ error: 'At least one elementId is required' });
    }
    if (!Array.isArray(travelerIds) || travelerIds.length === 0) {
      return res.status(400).json({ error: 'At least one travelerId is required' });
    }
    const foreign = await findForeignBookingRef(req.trip!.id, elementIds, travelerIds);
    if (foreign) {
      return res.status(404).json({ error: foreign });
    }
    const booking = await bookingRepository.createBooking(req.trip!.id, {
      confirmationNumber,
      advertisedPriceCash,
      advertisedPricePoints,
      loyaltyProgram,
      notes,
      elementIds,
      travelerIds,
    });
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
    const { confirmationNumber, advertisedPriceCash, advertisedPricePoints, loyaltyProgram, notes, elementIds, travelerIds } = req.body ?? {};
    if (elementIds !== undefined && (!Array.isArray(elementIds) || elementIds.length === 0)) {
      return res.status(400).json({ error: 'At least one elementId is required' });
    }
    if (travelerIds !== undefined && (!Array.isArray(travelerIds) || travelerIds.length === 0)) {
      return res.status(400).json({ error: 'At least one travelerId is required' });
    }
    const foreign = await findForeignBookingRef(req.trip!.id, elementIds, travelerIds);
    if (foreign) {
      return res.status(404).json({ error: foreign });
    }
    const updates: Record<string, unknown> = {};
    const fields = { confirmationNumber, advertisedPriceCash, advertisedPricePoints, loyaltyProgram, notes, elementIds, travelerIds };
    for (const [key, value] of Object.entries(fields)) {
      if (key in (req.body ?? {})) updates[key] = value;
    }
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
    const { amountCash, amountPoints, transactionDate, confirmationNumber, notes } = req.body;
    const transaction = await bookingTransactionRepository.addTransaction(req.params.bookingId, {
      amountCash,
      amountPoints,
      transactionDate,
      confirmationNumber,
      notes,
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
    const transactions = await bookingTransactionRepository.getTransactionsForBooking(req.params.bookingId);
    if (!transactions.some((transaction) => transaction.id === req.params.id)) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const updated = await bookingTransactionRepository.updateTransaction(req.params.id, req.body);
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
  const { name, memberIds, itemGroupIds, packingListId } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!Array.isArray(memberIds) || memberIds.length === 0) return res.status(400).json({ error: 'memberIds is required' });
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
    const destination = await tripDestinationRepository.create({
      tripId: req.trip!.id,
      familyId: req.trip!.family_id,
      name: name.trim(),
      memberIds,
      packingListId: typeof packingListId === 'string' && packingListId ? packingListId : undefined,
    });
    if (groupIds.length > 0) {
      const current = await packingListRepository.getTemplatesForPackingList(destination.packingListId);
      await packingListRepository.setTemplatesForPackingList(destination.packingListId, Array.from(new Set([...current, ...groupIds])));
      for (const groupId of groupIds) {
        await packingListRepository.reconcilePackingListAgainstTemplate(destination.packingListId, groupId);
      }
    }
    const tripLists = (await tripDestinationRepository.listForTrip(req.trip!.id)).map(d => d.packingListId);
    notify([destination.packingListId, ...tripLists], 'destination');
    return res.status(201).json(destination);
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to create destination');
  }
});

tripRouter.put('/:tripId/destinations/:destinationId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const existing = await tripDestinationRepository.getById(req.params.destinationId);
    if (!existing || existing.tripId !== req.trip!.id) return res.status(404).json({ error: 'Destination not found' });
    const { name, color, position, memberIds } = req.body || {};
    if (memberIds !== undefined && (!Array.isArray(memberIds) || memberIds.length === 0)) {
      return res.status(400).json({ error: 'memberIds must be a non-empty array' });
    }
    const updated = await tripDestinationRepository.update(existing.id, req.trip!.family_id, {
      name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
      color: typeof color === 'string' ? color : undefined,
      position: typeof position === 'number' ? position : undefined,
      memberIds,
    });
    notify([existing.packingListId], 'destination');
    return res.json(updated);
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to update destination');
  }
});

tripRouter.delete('/:tripId/destinations/:destinationId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const existing = await tripDestinationRepository.getById(req.params.destinationId);
    if (!existing || existing.tripId !== req.trip!.id) return res.status(404).json({ error: 'Destination not found' });
    const { moveSharedItemsTo, deleteList } = req.body || {};
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
    const moved = await withTransaction(db, async () => {
      const movedCount = target ? await moveAllSharedItemsTx(db, existing.packingListId, target.packingListId) : 0;
      const now = new Date().toISOString();
      await db.run(`UPDATE trip_destinations SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, existing.id]);
      if (deleteList) {
        await db.run(`UPDATE packing_lists SET deleted_at = ? WHERE id = ?`, [now, existing.packingListId]);
        await db.run(`DELETE FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [existing.tripId, existing.packingListId]);
      }
      return movedCount;
    });
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
