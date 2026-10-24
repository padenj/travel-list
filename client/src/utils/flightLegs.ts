import { FlightLeg, FlightLegPayload } from '../types/trip';

export interface FlightLegDraft {
  id?: string;
  flightDate: string;
  airline: string;
  flightNumber: string;
  departureAirport: string;
  departureDatetime: string;
  arrivalAirport: string;
  arrivalDatetime: string;
  checkPriceUrl: string;
}

export function emptyLegDraft(flightDate = ''): FlightLegDraft {
  return {
    flightDate,
    airline: '',
    flightNumber: '',
    departureAirport: '',
    departureDatetime: '',
    arrivalAirport: '',
    arrivalDatetime: '',
    checkPriceUrl: '',
  };
}

// <input type="datetime-local"> values are "YYYY-MM-DDTHH:mm"
export function toDatetimeLocalValue(value?: string | null): string {
  return value ? value.slice(0, 16) : '';
}

export function legToDraft(leg: FlightLeg): FlightLegDraft {
  const departure = toDatetimeLocalValue(leg.departureDatetime);
  return {
    id: leg.id,
    flightDate: departure.slice(0, 10),
    airline: leg.airline ?? '',
    flightNumber: leg.flightNumber ?? '',
    departureAirport: leg.departureAirport && leg.departureAirport !== 'TBD' ? leg.departureAirport : '',
    departureDatetime: departure,
    arrivalAirport: leg.arrivalAirport && leg.arrivalAirport !== 'TBD' ? leg.arrivalAirport : '',
    arrivalDatetime: toDatetimeLocalValue(leg.arrivalDatetime),
    checkPriceUrl: leg.checkPriceUrl ?? '',
  };
}

export function draftToPayload(draft: FlightLegDraft): FlightLegPayload {
  const fallback = draft.flightDate ? `${draft.flightDate}T00:00` : '';
  const departure = draft.departureDatetime || fallback;
  return {
    id: draft.id,
    departureAirport: draft.departureAirport.trim().toUpperCase() || 'TBD',
    departureDatetime: departure,
    arrivalAirport: draft.arrivalAirport.trim().toUpperCase() || 'TBD',
    arrivalDatetime: draft.arrivalDatetime || departure,
    airline: draft.airline.trim().toUpperCase() || undefined,
    flightNumber: draft.flightNumber.trim() || undefined,
    checkPriceUrl: draft.checkPriceUrl.trim() || undefined,
  };
}

export function draftHasDate(draft: FlightLegDraft): boolean {
  return Boolean(draft.departureDatetime || draft.flightDate);
}

export function buildFlightName(
  drafts: Pick<FlightLegDraft, 'departureAirport' | 'arrivalAirport'>[]
): string {
  const first = drafts[0]?.departureAirport.trim().toUpperCase();
  const stops = drafts.map(d => d.arrivalAirport.trim().toUpperCase());
  if (!first || stops.length === 0 || stops.some(s => !s)) return '';
  return [first, ...stops].join(' → ');
}

export function formatLayover(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  return hours ? `${hours}h` : `${mins}m`;
}

function toEpochMinutes(value: string): number {
  const normalized = /(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  return Date.parse(normalized) / 60000;
}

export function layoverMinutes(arrival: string, nextDeparture: string): number | null {
  if (!arrival || !nextDeparture) return null;
  const diff = toEpochMinutes(nextDeparture) - toEpochMinutes(arrival);
  return Number.isFinite(diff) && diff >= 0 ? Math.round(diff) : null;
}

// Shows the stored wall-clock time as-is (no timezone conversion).
export function formatLegTime(value?: string): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return value ?? '';
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return new Date(year, month - 1, day, hour, minute).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
