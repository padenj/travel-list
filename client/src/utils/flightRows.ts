import { Booking, TripElement } from '../types/trip';
import { formatLayover } from './flightLegs';
import { formatMoney } from './money';

export interface FlightRowLeg {
  id: string;
  label: string;
  route: string;
  times: string;
  layoverAfter: string | null;
}

export interface FlightRow {
  id: string;
  name: string;
  dateLabel: string;
  priceLabel: string;
  priceShared: boolean;
  confirmation: string;
  bookingCount: number;
  legs: FlightRowLeg[];
  sortKey: string;
}

export interface FlightTotals {
  cash: number;
  points: number;
  label: string;
}

const DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

// Stored times are airport-local wall-clock values, so no timezone conversion happens here.
export function formatClock(value?: string | null): string {
  const match = value?.match(DATETIME);
  if (!match) return '';
  const hour = Number(match[4]);
  return `${hour % 12 || 12}:${match[5]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function formatRowDate(value?: string | null): string {
  const match = value?.match(DATETIME);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${Number(match[2])}/${Number(match[3])}`;
}

function dayOffset(from?: string | null, to?: string | null): number {
  const a = from?.match(DATETIME);
  const b = to?.match(DATETIME);
  if (!a || !b) return 0;
  const diff = Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3]);
  return Math.round(diff / 86400000);
}

export function formatPrice(cash?: number | null, points?: number | null): string {
  const parts: string[] = [];
  if (points) parts.push(`${points.toLocaleString('en-US')} pts`);
  if (cash) parts.push(formatMoney(cash));
  return parts.join(' + ');
}

function legTimes(departure?: string, arrival?: string): string {
  const from = formatClock(departure);
  const to = formatClock(arrival);
  if (!from && !to) return '';
  const offset = dayOffset(departure, arrival);
  return `${from} → ${to}${offset > 0 ? ` +${offset}` : ''}`;
}

export function buildFlightRows(elements: TripElement[], bookings: Booking[]): FlightRow[] {
  return elements
    .filter(element => element.elementType === 'flight')
    .map(element => {
      const linked = bookings.filter(b => b.elementIds.includes(element.id));
      const legs = [...(element.legs ?? [])].sort((a, b) => a.legOrder - b.legOrder);
      const first = legs[0];
      const prices = linked
        .map(b => formatPrice(b.advertisedPriceCash, b.advertisedPricePoints))
        .filter(Boolean);
      const confirmations = linked
        .map(b => b.currentConfirmationNumber ?? b.confirmationNumber)
        .filter((c): c is string => Boolean(c));

      return {
        id: element.id,
        name: element.name,
        dateLabel: formatRowDate(first?.departureDatetime),
        priceLabel: prices.join(' · '),
        priceShared: linked.some(b => b.elementIds.length > 1),
        confirmation: confirmations.join(', '),
        bookingCount: linked.length,
        legs: legs.map((leg, index) => ({
          id: leg.id,
          label: `${leg.airline ?? ''}${leg.flightNumber ?? ''}`,
          route: `${leg.departureAirport || '—'} → ${leg.arrivalAirport || '—'}`,
          times: legTimes(leg.departureDatetime, leg.arrivalDatetime),
          layoverAfter:
            index < legs.length - 1 && leg.layoverMinutesAfter != null
              ? formatLayover(leg.layoverMinutesAfter)
              : null,
        })),
        sortKey: first?.departureDatetime ?? '9999',
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function flightTotals(elements: TripElement[], bookings: Booking[]): FlightTotals {
  const flightIds = new Set(elements.filter(e => e.elementType === 'flight').map(e => e.id));
  let cash = 0;
  let points = 0;
  for (const booking of bookings) {
    if (!booking.elementIds.some(id => flightIds.has(id))) continue;
    cash += booking.advertisedPriceCash ?? 0;
    points += booking.advertisedPricePoints ?? 0;
  }
  return { cash, points, label: formatPrice(cash, points) };
}
