import { describe, it, expect } from 'vitest';
import { buildListOptions, selectedOptionValue, groupListsByTrip, sortTripGroups, tripGroupLabel } from '../utils/listOptions';

const summary = (
  tripId: string,
  tripName: string,
  destinationName: string,
  position: number,
  destinationCount: number,
  tripStartDate: string | null = null,
  tripEndDate: string | null = tripStartDate,
) => ({
  tripId, tripName, destinationId: `${tripId}-${position}`, destinationName, position, destinationCount,
  color: position === 0 ? 'blue' : 'green', tripStartDate, tripEndDate,
});

const TODAY = '2027-03-10';

const lists = [
  { id: 'camping', name: 'Camping', trip_destination: summary('t-camp', 'Camping', 'Camping', 0, 1) },
  { id: 'grandma', name: "Spring Break · Grandma's", trip_destination: summary('t-spring', 'Spring Break', "Grandma's", 1, 2, '2027-03-20', '2027-03-27') },
  { id: 'paris', name: 'Spring Break · Paris', trip_destination: summary('t-spring', 'Spring Break', 'Paris', 0, 2, '2027-03-20', '2027-03-27') },
  { id: 'ski', name: 'Ski', trip_destination: summary('t-ski', 'Ski', 'Ski', 0, 1, '2027-01-02', '2027-01-09') },
  { id: 'summer', name: 'Summer', trip_destination: summary('t-summer', 'Summer', 'Summer', 0, 1, '2027-07-01', '2027-07-08') },
  { id: 'now', name: 'Now', trip_destination: summary('t-now', 'Now', 'Now', 0, 1, '2027-03-08', '2027-03-12') },
  { id: 'beach', name: 'Beach' },
];

describe('groupListsByTrip', () => {
  it('puts every destination list of a trip in one group, in position order', () => {
    const spring = groupListsByTrip(lists).find(g => g.tripId === 't-spring')!;
    expect(spring.entries.map(e => e.list.id)).toEqual(['paris', 'grandma']);
    expect(spring.entries.map(e => e.destinationName)).toEqual(['Paris', "Grandma's"]);
    expect(spring).toMatchObject({ tripName: 'Spring Break', startDate: '2027-03-20', endDate: '2027-03-27' });
  });

  it('treats a list without a trip as its own dateless group', () => {
    const beach = groupListsByTrip(lists).find(g => g.key === 'list:beach')!;
    expect(beach).toMatchObject({ tripId: null, tripName: 'Beach', startDate: null });
    expect(beach.entries.map(e => e.list.id)).toEqual(['beach']);
  });
});

describe('sortTripGroups', () => {
  it('orders upcoming trips by start date, then past trips, then dateless trips by name', () => {
    const order = sortTripGroups(groupListsByTrip(lists), TODAY).map(g => g.tripName);
    expect(order).toEqual(['Now', 'Spring Break', 'Summer', 'Ski', 'Beach', 'Camping']);
  });
});

describe('tripGroupLabel', () => {
  it('names a one-destination trip by the trip and counts destinations otherwise', () => {
    const groups = groupListsByTrip(lists);
    expect(tripGroupLabel(groups.find(g => g.tripId === 't-spring')!)).toBe('Spring Break · 2 destinations');
    expect(tripGroupLabel(groups.find(g => g.tripId === 't-camp')!)).toBe('Camping');
  });
});

describe('buildListOptions', () => {
  it('gives one option per trip that opens its first destination', () => {
    expect(buildListOptions(lists, TODAY)).toEqual([
      { value: 'now', label: 'Now', listIds: ['now'] },
      { value: 'paris', label: 'Spring Break · 2 destinations', listIds: ['paris', 'grandma'] },
      { value: 'summer', label: 'Summer', listIds: ['summer'] },
      { value: 'ski', label: 'Ski', listIds: ['ski'] },
      { value: 'beach', label: 'Beach', listIds: ['beach'] },
      { value: 'camping', label: 'Camping', listIds: ['camping'] },
    ]);
  });

  it('selects the trip option for any of its destination lists', () => {
    const options = buildListOptions(lists, TODAY);
    expect(selectedOptionValue(options, 'grandma')).toBe('paris');
    expect(selectedOptionValue(options, 'beach')).toBe('beach');
    expect(selectedOptionValue(options, null)).toBe('');
    expect(selectedOptionValue(options, 'unknown')).toBe('');
  });
});
