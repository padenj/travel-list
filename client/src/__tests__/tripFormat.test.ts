import { describe, it, expect } from 'vitest';
import { formatMoney } from '../utils/money';
import { buildFlightName, draftToPayload, emptyLegDraft, formatLayover, formatLegTime, layoverMinutes, legToDraft } from '../utils/flightLegs';

describe('formatMoney', () => {
  it('formats cents and whole dollars', () => {
    expect(formatMoney(137.96)).toBe('$137.96');
    expect(formatMoney(79)).toBe('$79.00');
  });

  it('puts the minus sign before the dollar sign', () => {
    expect(formatMoney(-20)).toBe('-$20.00');
  });
});

describe('flight leg helpers', () => {
  it('builds a name from the airport chain and returns empty when airports are missing', () => {
    const base = emptyLegDraft();
    expect(buildFlightName([{ ...base, departureAirport: 'den', arrivalAirport: 'sjd' }])).toBe('DEN → SJD');
    expect(buildFlightName([
      { ...base, departureAirport: 'DEN', arrivalAirport: 'DAL' },
      { ...base, departureAirport: 'DAL', arrivalAirport: 'SJD' },
    ])).toBe('DEN → DAL → SJD');
    expect(buildFlightName([{ ...base, departureAirport: 'DEN' }])).toBe('');
  });

  it('converts drafts to payloads with TBD airports and midnight fallback', () => {
    const draft = { ...emptyLegDraft('2026-09-12'), flightNumber: ' WN123 ', airline: 'wn' };
    expect(draftToPayload(draft)).toEqual({
      id: undefined,
      departureAirport: 'TBD',
      departureDatetime: '2026-09-12T00:00',
      arrivalAirport: 'TBD',
      arrivalDatetime: '2026-09-12T00:00',
      airline: 'WN',
      flightNumber: 'WN123',
      checkPriceUrl: undefined,
    });
  });

  it('round-trips a saved leg into a draft, hiding TBD airports', () => {
    const draft = legToDraft({
      id: 'l1', elementId: 'e1', legOrder: 1, departureAirport: 'TBD', departureDatetime: '2026-09-12T08:30:00Z',
      arrivalAirport: 'SJD', arrivalDatetime: '2026-09-12T11:00:00Z', airline: 'WN', flightNumber: '722', createdAt: '', updatedAt: '',
    });
    expect(draft).toMatchObject({ id: 'l1', flightDate: '2026-09-12', departureAirport: '', arrivalAirport: 'SJD', departureDatetime: '2026-09-12T08:30' });
  });

  it('formats layovers and wall-clock times without timezone shifts', () => {
    expect(formatLayover(135)).toBe('2h 15m');
    expect(formatLayover(60)).toBe('1h');
    expect(formatLayover(45)).toBe('45m');
    expect(layoverMinutes('2026-11-10T10:00', '2026-11-10T12:15')).toBe(135);
    expect(layoverMinutes('2026-11-10T12:00', '2026-11-10T10:00')).toBeNull();
    expect(formatLegTime('2026-11-10T08:00')).toMatch(/Nov 10.*8:00\s?AM/);
  });
});
