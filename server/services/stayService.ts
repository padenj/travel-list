import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { TripElement, TripElementRepository } from '../repositories/tripElementRepository';
import { BookingRepository, UpdateBookingInput } from '../repositories/bookingRepository';
import { BookingService } from './bookingService';
import { FirstTransaction } from '../utils/firstTransaction';

export interface StayInput {
  name?: string;
  notes?: string | null;
  typeSpecificData?: Record<string, unknown>;
  booking?: UpdateBookingInput;
  firstTransaction?: FirstTransaction | null;
}

// A stay (hotel element) always owns exactly one booking; both are written in one transaction.
export class StayService {
  private elements = new TripElementRepository();
  private bookings = new BookingRepository();
  private bookingService = new BookingService();

  async createStay(tripId: string, input: StayInput): Promise<TripElement> {
    const db = await getDb();
    const id = await withTransaction(db, async () => {
      const element = await this.elements.createElement(tripId, {
        elementType: 'hotel', name: input.name, notes: input.notes ?? undefined, typeSpecificData: input.typeSpecificData,
      } as any);
      await this.bookingService.createBooking(
        tripId, { ...(input.booking ?? {}), elementIds: [element.id], travelerIds: [] } as any, input.firstTransaction ?? null,
      );
      return element.id;
    });
    return (await this.elements.getElementById(id))!;
  }

  async updateStay(tripId: string, elementId: string, input: StayInput): Promise<TripElement> {
    const db = await getDb();
    await withTransaction(db, async () => {
      const { booking, firstTransaction: _ignored, ...elementUpdates } = input;
      if (Object.keys(elementUpdates).length > 0) {
        await this.elements.updateElement(elementId, elementUpdates as any);
      }
      if (booking !== undefined) {
        const bookingId = await this.bookings.getBookingIdForElement(elementId);
        if (bookingId) await this.bookings.updateBooking(bookingId, booking);
        else await this.bookings.createBooking(tripId, { ...booking, elementIds: [elementId], travelerIds: [] } as any);
      }
    });
    return (await this.elements.getElementById(elementId))!;
  }
}
