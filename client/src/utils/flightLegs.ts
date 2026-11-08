import { FlightAutofillDetails, FlightLeg, FlightLegPayload } from '../types/trip';

export type ArrivalDayOffset = 0 | 1 | 2;

export interface FlightLegDraft {
  id?: string;
  flightCode: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  arrivalDayOffset: ArrivalDayOffset;
  departureAirport: string;
  arrivalAirport: string;
  checkPriceUrl: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function addDays(date: string, days: number): string {
  if (!DATE_RE.test(date)) return date;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function clampOffset(days: number): ArrivalDayOffset {
  return Math.min(2, Math.max(0, days)) as ArrivalDayOffset;
}

// Stored datetimes are wall-clock "YYYY-MM-DDTHH:mm[...]" values.
function splitDatetime(value?: string | null): { date: string; time: string } {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? { date: match[1], time: match[2] } : { date: '', time: '' };
}

function cleanAirport(value?: string | null): string {
  return value && value !== 'TBD' ? value : '';
}

// "WN1234" -> WN + 1234; "SWA1234" -> SWA + 1234; unparseable input is kept as the flight number.
export function parseFlightCode(code: string): { airline?: string; flightNumber?: string } {
  const clean = code.replace(/[\s-]/g, '').toUpperCase();
  if (!clean) return {};
  const icao = clean.match(/^([A-Z]{3})(\d.*)$/);
  if (icao) return { airline: icao[1], flightNumber: icao[2] };
  const iata = clean.match(/^([A-Z0-9]{2})(\d.*)$/);
  if (iata && /[A-Z]/.test(iata[1])) return { airline: iata[1], flightNumber: iata[2] };
  return { flightNumber: clean };
}

export function formatFlightCode(airline?: string | null, flightNumber?: string | null): string {
  return `${airline ?? ''}${flightNumber ?? ''}`;
}

export function emptyLegDraft(previous?: FlightLegDraft): FlightLegDraft {
  return {
    flightCode: '',
    date: previous?.date ? addDays(previous.date, previous.arrivalDayOffset) : '',
    departureTime: '',
    arrivalTime: '',
    arrivalDayOffset: 0,
    departureAirport: previous?.arrivalAirport ?? '',
    arrivalAirport: '',
    checkPriceUrl: '',
  };
}

// Toggles Same day <-> +1 when times change; a manual +2 is left alone.
export function autoArrivalOffset(departureTime: string, arrivalTime: string, current: ArrivalDayOffset): ArrivalDayOffset {
  if (!TIME_RE.test(departureTime) || !TIME_RE.test(arrivalTime) || current === 2) return current;
  return arrivalTime < departureTime ? 1 : 0;
}

export function legToDraft(leg: FlightLeg): FlightLegDraft {
  const departure = splitDatetime(leg.departureDatetime);
  const arrival = splitDatetime(leg.arrivalDatetime);
  return {
    id: leg.id,
    flightCode: formatFlightCode(leg.airline, leg.flightNumber),
    date: departure.date,
    departureTime: departure.time,
    arrivalTime: arrival.time,
    arrivalDayOffset: departure.date && arrival.date ? clampOffset(dayDiff(departure.date, arrival.date)) : 0,
    departureAirport: cleanAirport(leg.departureAirport),
    arrivalAirport: cleanAirport(leg.arrivalAirport),
    checkPriceUrl: leg.checkPriceUrl ?? '',
  };
}

// For legs that are not being edited: send back exactly what is stored.
export function legToPayload(leg: FlightLeg): FlightLegPayload {
  return {
    id: leg.id,
    departureAirport: leg.departureAirport,
    departureDatetime: leg.departureDatetime,
    arrivalAirport: leg.arrivalAirport,
    arrivalDatetime: leg.arrivalDatetime,
    airline: leg.airline || undefined,
    flightNumber: leg.flightNumber || undefined,
    checkPriceUrl: leg.checkPriceUrl || undefined,
  };
}

// Assumes validateDraft(draft) returned null.
export function draftToPayload(draft: FlightLegDraft): FlightLegPayload {
  const { airline, flightNumber } = parseFlightCode(draft.flightCode);
  return {
    id: draft.id,
    departureAirport: draft.departureAirport.trim().toUpperCase(),
    departureDatetime: `${draft.date}T${draft.departureTime}`,
    arrivalAirport: draft.arrivalAirport.trim().toUpperCase(),
    arrivalDatetime: `${addDays(draft.date, draft.arrivalDayOffset)}T${draft.arrivalTime}`,
    airline,
    flightNumber,
    checkPriceUrl: draft.checkPriceUrl.trim() || undefined,
  };
}

export function validateDraft(draft: FlightLegDraft): string | null {
  if (!DATE_RE.test(draft.date)) return 'Enter the flight date';
  if (!draft.departureAirport.trim() || !draft.arrivalAirport.trim()) return 'Enter both airport codes';
  if (!TIME_RE.test(draft.departureTime) || !TIME_RE.test(draft.arrivalTime)) return 'Enter the departure and arrival times';
  if (draft.arrivalDayOffset === 0 && draft.arrivalTime < draft.departureTime) {
    return 'Arrival is before departure — choose +1 for a next-day arrival';
  }
  return null;
}

export function applyLookup(draft: FlightLegDraft, details: FlightAutofillDetails): FlightLegDraft {
  const departure = splitDatetime(details.departureDatetime);
  const arrival = splitDatetime(details.arrivalDatetime);
  return {
    ...draft,
    flightCode: formatFlightCode(details.airlineCode, details.flightNumber) || draft.flightCode,
    date: departure.date || details.flightDate || draft.date,
    departureTime: departure.time || draft.departureTime,
    arrivalTime: arrival.time || draft.arrivalTime,
    arrivalDayOffset: departure.date && arrival.date ? clampOffset(dayDiff(departure.date, arrival.date)) : draft.arrivalDayOffset,
    departureAirport: details.departureAirport || draft.departureAirport,
    arrivalAirport: details.arrivalAirport || draft.arrivalAirport,
  };
}

export function draftLayover(previous: FlightLegDraft, next: FlightLegDraft): number | null {
  if (!previous.date || !previous.arrivalTime || !next.date || !next.departureTime) return null;
  return layoverMinutes(
    `${addDays(previous.date, previous.arrivalDayOffset)}T${previous.arrivalTime}`,
    `${next.date}T${next.departureTime}`
  );
}

// "2026-08-29T08:00" or "08:00" -> "8:00a"
export function formatClock(value?: string | null): string {
  const match = value?.match(/(\d{2}):(\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]}${hour < 12 ? 'a' : 'p'}`;
}

// "WN1234 · DEN 8:00a → DAL 10:00a +1"
export function formatLegLine(leg: FlightLeg): string {
  const departure = splitDatetime(leg.departureDatetime);
  const arrival = splitDatetime(leg.arrivalDatetime);
  const offset = departure.date && arrival.date ? dayDiff(departure.date, arrival.date) : 0;
  const from = [leg.departureAirport, formatClock(leg.departureDatetime)].filter(Boolean).join(' ');
  const to = [leg.arrivalAirport, formatClock(leg.arrivalDatetime)].filter(Boolean).join(' ');
  const route = `${from} → ${to}${offset > 0 ? ` +${offset}` : ''}`;
  const code = formatFlightCode(leg.airline, leg.flightNumber);
  return code ? `${code} · ${route}` : route;
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
