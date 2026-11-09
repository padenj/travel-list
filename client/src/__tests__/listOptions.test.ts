import { describe, it, expect } from 'vitest';
import { buildListOptions, selectedOptionValue } from '../utils/listOptions';

const summary = (destinationId: string, destinationName: string, position: number) => ({
  tripId: 't1', tripName: 'Spring Break', destinationId, destinationName, position, destinationCount: 2,
});

const lists = [
  { id: 'beach', name: 'Beach' },
  { id: 'grandma', name: "Spring – Grandma's", trip_destination: summary('d2', "Grandma's", 1) },
  { id: 'paris', name: 'Spring – Paris', trip_destination: summary('d1', 'Paris', 0) },
];

describe('buildListOptions', () => {
  it('collapses a trip into one option that opens its first destination', () => {
    expect(buildListOptions(lists)).toEqual([
      { value: 'beach', label: 'Beach', listIds: ['beach'] },
      { value: 'paris', label: 'Spring Break · 2 destinations', listIds: ['grandma', 'paris'] },
    ]);
  });

  it('selects the trip option for any of its destination lists', () => {
    const options = buildListOptions(lists);
    expect(selectedOptionValue(options, 'grandma')).toBe('paris');
    expect(selectedOptionValue(options, 'beach')).toBe('beach');
    expect(selectedOptionValue(options, null)).toBe('');
    expect(selectedOptionValue(options, 'unknown')).toBe('');
  });
});
