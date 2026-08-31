import { Router, Request, Response } from 'express';
import { TripRepository } from '../repositories/tripRepository';
import { TripElementRepository } from '../repositories/tripElementRepository';
import { TripElementConfirmationRepository } from '../repositories/tripElementConfirmationRepository';
import { authMiddleware } from '../middleware';
import { tripAccessMiddleware } from '../middleware/tripAccessMiddleware';

export const tripRouter = Router();

const tripRepository = new TripRepository();
const tripElementRepository = new TripElementRepository();
const tripElementConfirmationRepository = new TripElementConfirmationRepository();

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
  res.json(req.trip);
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

// Create element
tripRouter.post('/:tripId/elements', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const { elementType, name, bookingReference, bookingUrl, priceCash, pricePoints, loyaltyProgram, totalCash, totalPoints, notes, sortPosition, typeSpecificData } = req.body;
    if (!elementType || !name) {
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
    const conf = await tripElementConfirmationRepository.updateConfirmation(req.params.confirmationId, req.body);
    res.json(conf);
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
    await tripElementConfirmationRepository.deleteConfirmation(req.params.confirmationId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete confirmation' });
  }
});
