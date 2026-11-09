import type { ListTripSummary } from '../types/trip';

export interface ListOption {
  value: string;
  label: string;
  listIds: string[];
}

export interface ListLike {
  id: string;
  name: string;
  trip_destination?: ListTripSummary | null;
}

export interface TripGroupEntry<L extends ListLike = ListLike> {
  list: L;
  destinationId: string | null;
  destinationName: string;
  position: number;
  color: string | null;
}

export interface TripGroup<L extends ListLike = ListLike> {
  /** `trip:<id>`, or `list:<id>` for a list the server has not put in a trip. */
  key: string;
  tripId: string | null;
  tripName: string;
  startDate: string | null;
  endDate: string | null;
  entries: TripGroupEntry<L>[];
}

export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function groupListsByTrip<L extends ListLike>(lists: L[]): TripGroup<L>[] {
  const groups = new Map<string, TripGroup<L>>();
  for (const list of lists) {
    const trip = list.trip_destination ?? null;
    const key = trip ? `trip:${trip.tripId}` : `list:${list.id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        tripId: trip?.tripId ?? null,
        tripName: trip?.tripName ?? list.name,
        startDate: trip?.tripStartDate ?? null,
        endDate: trip?.tripEndDate ?? null,
        entries: [],
      };
      groups.set(key, group);
    }
    group.entries.push({
      list,
      destinationId: trip?.destinationId ?? null,
      destinationName: trip?.destinationName ?? list.name,
      position: trip?.position ?? 0,
      color: trip?.color ?? null,
    });
  }
  const result = Array.from(groups.values());
  for (const group of result) group.entries.sort((a, b) => a.position - b.position);
  return result;
}

// Upcoming (including ongoing) trips by start date, then past trips most recent first, then dateless trips by name.
export function sortTripGroups<L extends ListLike>(groups: TripGroup<L>[], today: string = todayIso()): TripGroup<L>[] {
  const rank = (g: TripGroup<L>) => (!g.startDate ? 2 : (g.endDate || g.startDate) >= today ? 0 : 1);
  return [...groups].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.startDate!.localeCompare(b.startDate!);
    if (ra === 1) return b.startDate!.localeCompare(a.startDate!);
    return a.tripName.localeCompare(b.tripName, undefined, { sensitivity: 'base' });
  });
}

export function tripGroupLabel(group: TripGroup<any>): string {
  const count = group.entries.length;
  return count >= 2 ? `${group.tripName} · ${count} destinations` : group.tripName;
}

// One option per trip; choosing it activates the trip's lowest-position destination list.
export function buildListOptions(lists: ListLike[], today: string = todayIso()): ListOption[] {
  return sortTripGroups(groupListsByTrip(lists), today).map(group => ({
    value: group.entries[0].list.id,
    label: tripGroupLabel(group),
    listIds: group.entries.map(e => e.list.id),
  }));
}

export function selectedOptionValue(options: ListOption[], activeListId: string | null): string {
  if (!activeListId) return '';
  return options.find(o => o.listIds.includes(activeListId))?.value ?? '';
}
