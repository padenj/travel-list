// Same rule as server/utils/destinationLabel.ts; keep the two in step.
const clean = (value: string | null | undefined) => (value ?? '').trim();

/** True when two names are equal ignoring case and surrounding spaces. */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

/** The name shown for a destination's list: "Trip · Destination", or just "Trip" when the names match. */
export function destinationListLabel(tripName: string | null | undefined, destinationName: string | null | undefined): string {
  const trip = clean(tripName);
  const destination = clean(destinationName);
  if (!trip) return destination;
  if (!destination || namesMatch(trip, destination)) return trip;
  return `${trip} · ${destination}`;
}
