import { Booking, TripDestination, TripElement } from '../types/trip';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';
import { nightsBetween } from './tripDates';
import { DeadlineState, cancelDeadlineState, cancelLabel } from './lodging';

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
}

function shortDate(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function roomsFor(elementId: string, bookings: Booking[]): Booking[] {
  return bookings.filter(b => b.elementIds.length === 1 && b.elementIds[0] === elementId);
}

function confirmLabel(b: Booking): string {
  return [b.siteItineraryNumber, b.currentConfirmationNumber].filter(Boolean).join(' / ');
}

export function buildLodgingRows(elements: TripElement[], bookings: Booking[], destinations: TripDestination[], now: Date = new Date()): LodgingRow[] {
  return elements
    .filter(e => e.elementType === 'hotel')
    .map(element => {
      const h = element.hotelDetails;
      const rooms = roomsFor(element.id, bookings);
      const nights = nightsBetween(h?.checkInDate, h?.checkOutDate);
      const dateLabel = h?.checkInDate && h?.checkOutDate
        ? `${shortDate(h.checkInDate)} → ${shortDate(h.checkOutDate)}${nights ? ` · ${nights} nt${nights === 1 ? '' : 's'}` : ''}`
        : '';

      const advCash = rooms.reduce((s, r) => s + (r.advertisedPriceCash ?? 0), 0);
      const advPts = rooms.reduce((s, r) => s + (r.advertisedPricePoints ?? 0), 0);
      const paidCash = rooms.reduce((s, r) => s + r.actualTotalCash, 0);
      const paidPts = rooms.reduce((s, r) => s + r.actualTotalPoints, 0);
      let priceLabel = '—';
      if (advCash || advPts) {
        priceLabel = formatPrice(advCash, advPts);
        if (advCash && nights) priceLabel += ` (${formatMoney(Math.round((advCash / nights) * 100) / 100)}/nt)`;
      } else if (paidCash || paidPts) {
        priceLabel = `Paid ${formatPrice(paidCash, paidPts)}`;
      }

      const labels = rooms.map(confirmLabel);
      const first = labels[0] ?? '';
      const distinct = new Set(labels.filter(Boolean));
      const extra = first && distinct.size > 1 ? ` +${distinct.size - 1}` : '';
      const confirmation = first ? `${first}${extra}` : '—';

      const deadlines = rooms
        .filter(r => r.room?.cancelBy)
        .map(r => ({ cancelBy: r.room!.cancelBy!, label: cancelLabel(r.room), state: cancelDeadlineState(r.room!.cancelBy, now) }));
      const upcoming = deadlines.filter(d => d.state !== 'passed').sort((a, b) => (a.cancelBy < b.cancelBy ? -1 : 1));
      const passed = deadlines.filter(d => d.state === 'passed').sort((a, b) => (a.cancelBy < b.cancelBy ? 1 : -1));
      const pick = upcoming[0] ?? passed[0];

      const dest = h?.destinationId ? destinations.find(d => d.id === h.destinationId) : undefined;

      return {
        id: element.id,
        name: element.name,
        checkInDate: h?.checkInDate ?? '',
        dateLabel,
        nights,
        priceLabel,
        confirmation,
        roomCount: rooms.length,
        destination: dest ? { name: dest.name, color: dest.color } : null,
        deadline: pick ? { label: pick.label, state: pick.state as Exclude<DeadlineState, 'none'> } : null,
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

// Each room counts its advertised total, or what was paid when nothing was advertised.
export function lodgingTotals(elements: TripElement[], bookings: Booking[]): { cash: number; points: number; label: string } {
  const stayIds = new Set(elements.filter(e => e.elementType === 'hotel').map(e => e.id));
  let cash = 0;
  let points = 0;
  for (const b of bookings) {
    if (b.elementIds.length !== 1 || !stayIds.has(b.elementIds[0])) continue;
    if (b.advertisedPriceCash || b.advertisedPricePoints) {
      cash += b.advertisedPriceCash ?? 0;
      points += b.advertisedPricePoints ?? 0;
    } else {
      cash += b.actualTotalCash;
      points += b.actualTotalPoints;
    }
  }
  return { cash, points, label: formatPrice(cash, points) };
}
