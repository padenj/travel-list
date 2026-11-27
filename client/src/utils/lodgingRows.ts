import { Booking, TripDestination, TripElement } from '../types/trip';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';
import { nightsBetween } from './tripDates';
import { DeadlineState, cancelDeadlineState, cancelLabel, nightlyPrice, paymentSummary } from './lodging';

export interface LodgingRow {
  id: string;
  name: string;
  checkInDate: string;
  dateLabel: string;
  nights: number | null;
  priceLabel: string;
  confirmation: string;
  roomCount: number;
  destination: { name: string; color: string | null } | null;
  deadline: { label: string; state: Exclude<DeadlineState, 'none'> } | null;
  remaining: string | null;
}

function shortDate(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// The stay's single booking: by bookingId, else the first booking linking only this stay.
export function stayBooking(element: TripElement, bookings: Booking[]): Booking | null {
  if (element.bookingId) {
    const byId = bookings.find(b => b.id === element.bookingId);
    if (byId) return byId;
  }
  return bookings.find(b => b.elementIds.length === 1 && b.elementIds[0] === element.id) ?? null;
}

export function buildLodgingRows(elements: TripElement[], bookings: Booking[], destinations: TripDestination[], now: Date = new Date()): LodgingRow[] {
  return elements
    .filter(e => e.elementType === 'hotel')
    .map(element => {
      const h = element.hotelDetails;
      const b = stayBooking(element, bookings);
      const nights = nightsBetween(h?.checkInDate, h?.checkOutDate);
      const dateLabel = h?.checkInDate && h?.checkOutDate
        ? `${shortDate(h.checkInDate)} → ${shortDate(h.checkOutDate)}${nights ? ` · ${nights} nt${nights === 1 ? '' : 's'}` : ''}`
        : '';

      let priceLabel = '—';
      if (b && (b.advertisedPriceCash || b.advertisedPricePoints)) {
        priceLabel = formatPrice(b.advertisedPriceCash, b.advertisedPricePoints);
        const nightly = nightlyPrice(b, nights);
        if (nightly) priceLabel += ` (${formatMoney(nightly)}/nt)`;
      } else if (b && (b.actualTotalCash || b.actualTotalPoints)) {
        priceLabel = `Paid ${formatPrice(b.actualTotalCash, b.actualTotalPoints)}`;
      }

      const confirmation = b ? [b.siteItineraryNumber, b.currentConfirmationNumber].filter(Boolean).join(' / ') || '—' : '—';
      const state = cancelDeadlineState(b?.cancelBy ?? null, now);
      const summary = paymentSummary(b);
      const dest = h?.destinationId ? destinations.find(d => d.id === h.destinationId) : undefined;

      return {
        id: element.id,
        name: element.name,
        checkInDate: h?.checkInDate ?? '',
        dateLabel,
        nights,
        priceLabel,
        confirmation,
        roomCount: element.rooms?.length ?? 0,
        destination: dest ? { name: dest.name, color: dest.color } : null,
        deadline: state !== 'none' ? { label: cancelLabel(b), state } : null,
        remaining: summary && (summary.remainingCash > 0 || summary.remainingPoints > 0) ? summary.label : null,
      };
    })
    .sort((a, b) => {
      if (a.checkInDate !== b.checkInDate) {
        if (!a.checkInDate) return 1;
        if (!b.checkInDate) return -1;
        return a.checkInDate < b.checkInDate ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

// Per stay: the amounts due if any are set, else the advertised total, else what was paid.
export function lodgingTotals(elements: TripElement[], bookings: Booking[]): { cash: number; points: number; label: string } {
  let cash = 0;
  let points = 0;
  for (const element of elements) {
    if (element.elementType !== 'hotel') continue;
    const b = stayBooking(element, bookings);
    if (!b) continue;
    const summary = paymentSummary(b);
    if (summary) {
      cash += summary.dueCash;
      points += summary.duePoints;
    } else if (b.advertisedPriceCash || b.advertisedPricePoints) {
      cash += b.advertisedPriceCash ?? 0;
      points += b.advertisedPricePoints ?? 0;
    } else {
      cash += b.actualTotalCash;
      points += b.actualTotalPoints;
    }
  }
  cash = Math.round(cash * 100) / 100;
  return { cash, points, label: formatPrice(cash, points) };
}
