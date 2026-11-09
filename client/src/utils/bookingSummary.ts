import { Booking } from '../types/trip';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';

export function bookingMoneyLine(booking: Booking): string {
  const parts: string[] = [];

  const advertised = formatPrice(booking.advertisedPriceCash, booking.advertisedPricePoints);
  if (advertised) parts.push(`Advertised ${advertised}/person`);

  const paid = formatPrice(booking.actualTotalCash, booking.actualTotalPoints);
  if (!paid) {
    parts.push('Paid $0.00');
  } else if (booking.actualTotalCash !== 0 && booking.travelerIds.length > 0) {
    const perPerson = formatMoney(booking.actualTotalCash / booking.travelerIds.length);
    parts.push(`Paid ${paid} (${perPerson}/person)`);
  } else {
    parts.push(`Paid ${paid}`);
  }

  return parts.join(' · ');
}
