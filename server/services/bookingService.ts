import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { Booking, BookingRepository, CreateBookingInput } from '../repositories/bookingRepository';
import { BookingTransactionRepository } from '../repositories/bookingTransactionRepository';
import { FirstTransaction } from '../utils/firstTransaction';

// Creates a booking and, optionally, its first payment in one DB transaction.
export class BookingService {
  private bookings = new BookingRepository();
  private transactions = new BookingTransactionRepository();

  async createBooking(tripId: string, input: CreateBookingInput, first: FirstTransaction | null = null): Promise<Booking> {
    const db = await getDb();
    const id = await withTransaction(db, async () => {
      const booking = await this.bookings.createBooking(tripId, input);
      if (first) {
        await this.transactions.addTransaction(booking.id, {
          amountCash: first.amountCash,
          amountPoints: first.amountPoints,
          transactionDate: first.transactionDate,
          paymentMethodId: first.paymentMethodId,
        });
      }
      return booking.id;
    });
    return (await this.bookings.getBookingById(id))!;
  }
}
