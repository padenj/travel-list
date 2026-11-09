import type { ListTripSummary } from '../types/trip';

export interface ListOption {
  value: string;
  label: string;
  listIds: string[];
}

interface ListLike {
  id: string;
  name: string;
  trip_destination?: ListTripSummary | null;
}

// One entry per ordinary list, and one per trip whose value is its lowest-position destination list.
export function buildListOptions(lists: ListLike[]): ListOption[] {
  const options: ListOption[] = [];
  const trips = new Map<string, { option: ListOption; position: number }>();
  for (const list of lists) {
    const trip = list.trip_destination;
    if (!trip) {
      options.push({ value: list.id, label: list.name, listIds: [list.id] });
      continue;
    }
    const existing = trips.get(trip.tripId);
    if (existing) {
      existing.option.listIds.push(list.id);
      if (trip.position < existing.position) {
        existing.position = trip.position;
        existing.option.value = list.id;
      }
      continue;
    }
    const count = trip.destinationCount;
    const option = { value: list.id, label: `${trip.tripName} · ${count} ${count === 1 ? 'destination' : 'destinations'}`, listIds: [list.id] };
    trips.set(trip.tripId, { option, position: trip.position });
    options.push(option);
  }
  return options;
}

export function selectedOptionValue(options: ListOption[], activeListId: string | null): string {
  if (!activeListId) return '';
  return options.find(o => o.listIds.includes(activeListId))?.value ?? '';
}
