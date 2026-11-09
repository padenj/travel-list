import { describe, it, expect } from 'vitest';
import { formatTripDateRange, nightsBetween, formatNights } from '../utils/tripDates';

describe('tripDates', () => {
  it('formats a same-year range', () => {
    expect(formatTripDateRange('2026-08-29', '2026-09-05')).toBe('Aug 29 – Sep 5, 2026');
  });

  it('includes both years when the range crosses a year', () => {
    expect(formatTripDateRange('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });

  it('returns an empty string when either date is missing or invalid', () => {
    expect(formatTripDateRange(undefined, '2026-09-05')).toBe('');
    expect(formatTripDateRange('2026-08-29', undefined)).toBe('');
    expect(formatTripDateRange('nope', '2026-09-05')).toBe('');
  });

  it('counts nights between dates', () => {
    expect(nightsBetween('2026-08-29', '2026-09-05')).toBe(7);
    expect(nightsBetween('2026-09-01', '2026-09-01')).toBe(0);
  });

  it('returns null nights for missing or reversed dates', () => {
    expect(nightsBetween(undefined, '2026-09-05')).toBeNull();
    expect(nightsBetween('2026-09-05', '2026-08-29')).toBeNull();
  });

  it('pluralizes nights', () => {
    expect(formatNights(1)).toBe('1 night');
    expect(formatNights(7)).toBe('7 nights');
  });
});
