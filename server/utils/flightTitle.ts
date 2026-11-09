export interface TitleLeg {
  departureAirport?: string | null;
  arrivalAirport?: string | null;
}

function cleanAirport(value?: string | null): string {
  const code = (value ?? '').trim().toUpperCase();
  return code && code !== 'TBD' ? code : '';
}

// "FIRST → LAST" for a one-way journey; null when either end is unknown.
export function flightTitle(legs: TitleLeg[]): string | null {
  if (legs.length === 0) return null;
  const from = cleanAirport(legs[0].departureAirport);
  const to = cleanAirport(legs[legs.length - 1].arrivalAirport);
  return from && to ? `${from} → ${to}` : null;
}
