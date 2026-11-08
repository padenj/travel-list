import { describe, it, expect } from 'vitest';
import { FlightLeg } from '../types/trip';
import {
  FlightLegDraft, addDays, applyLookup, autoArrivalOffset, draftLayover, draftToPayload, emptyLegDraft,
  formatClock, formatFlightCode, formatLegLine, legToDraft, legToPayload, parseFlightCode, validateDraft,
} from '../utils/flightLegs';

const leg = (over: Partial<FlightLeg> = {}): FlightLeg => ({
  id: 'l1', elementId: 'e1', legOrder: 1,
  departureAirport: 'DEN', departureDatetime: '2026-08-29T08:00',
  arrivalAirport: 'DAL', arrivalDatetime: '2026-08-29T10:00',
  airline: 'WN', flightNumber: '1234', createdAt: '', updatedAt: '',
  ...over,
});

const draft = (over: Partial<FlightLegDraft> = {}): FlightLegDraft => ({
  flightCode: 'WN1234', date: '2026-08-29', departureTime: '08:00', arrivalTime: '10:00', arrivalDayOffset: 0,
  departureAirport: 'DEN', arrivalAirport: 'DAL', checkPriceUrl: '',
  ...over,
});

describe('parseFlightCode', () => {
  it.each([
    ['WN1234', { airline: 'WN', flightNumber: '1234' }],
    ['wn 1234', { airline: 'WN', flightNumber: '1234' }],
    ['WN-1234', { airline: 'WN', flightNumber: '1234' }],
    ['B61234', { airline: 'B6', flightNumber: '1234' }],
    ['9K123', { airline: '9K', flightNumber: '123' }],
    ['SWA1234', { airline: 'SWA', flightNumber: '1234' }],
    ['1234', { flightNumber: '1234' }],
    ['DELTA', { flightNumber: 'DELTA' }],
    ['', {}],
  ])('parses %s', (input, expected) => {
    expect(parseFlightCode(input)).toEqual(expected);
  });

  it('formats airline + number back into one code', () => {
    expect(formatFlightCode('WN', '1234')).toBe('WN1234');
    expect(formatFlightCode(undefined, '1234')).toBe('1234');
    expect(formatFlightCode()).toBe('');
  });
});

describe('dates and offsets', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-08-29', 0)).toBe('2026-08-29');
  });

  it('auto-sets +1 when arrival is earlier than departure and back to same day otherwise', () => {
    expect(autoArrivalOffset('23:00', '01:30', 0)).toBe(1);
    expect(autoArrivalOffset('08:00', '10:00', 1)).toBe(0);
    expect(autoArrivalOffset('08:00', '', 1)).toBe(1);
    expect(autoArrivalOffset('23:00', '01:30', 2)).toBe(2);
  });

  it('defaults a new leg from the previous one', () => {
    expect(emptyLegDraft()).toEqual(draft({ flightCode: '', date: '', departureTime: '', arrivalTime: '', departureAirport: '', arrivalAirport: '' }));
    const next = emptyLegDraft(draft({ date: '2026-08-31', arrivalAirport: 'DAL', arrivalDayOffset: 1 }));
    expect(next).toMatchObject({ date: '2026-09-01', departureAirport: 'DAL', arrivalAirport: '', flightCode: '' });
  });
});

describe('leg <-> draft <-> payload', () => {
  it('splits a stored leg into a draft', () => {
    expect(legToDraft(leg())).toEqual(draft({ id: 'l1' }));
  });

  it('computes the arrival-day offset and hides TBD airports', () => {
    const d = legToDraft(leg({ departureAirport: 'TBD', departureDatetime: '2026-08-31T23:00', arrivalDatetime: '2026-09-01T01:30' }));
    expect(d).toMatchObject({ date: '2026-08-31', departureTime: '23:00', arrivalTime: '01:30', arrivalDayOffset: 1, departureAirport: '' });
  });

  it('recombines a draft into a payload, splitting the flight code', () => {
    expect(draftToPayload(draft({ id: 'l1', date: '2026-08-31', departureTime: '23:00', arrivalTime: '01:30', arrivalDayOffset: 1, departureAirport: 'den', checkPriceUrl: ' https://x ' }))).toEqual({
      id: 'l1',
      departureAirport: 'DEN',
      departureDatetime: '2026-08-31T23:00',
      arrivalAirport: 'DAL',
      arrivalDatetime: '2026-09-01T01:30',
      airline: 'WN',
      flightNumber: '1234',
      checkPriceUrl: 'https://x',
    });
  });

  it('round-trips leg -> draft -> payload', () => {
    const stored = leg({ departureDatetime: '2026-08-31T23:00', arrivalDatetime: '2026-09-01T01:30' });
    expect(draftToPayload(legToDraft(stored))).toMatchObject({
      id: 'l1', departureDatetime: '2026-08-31T23:00', arrivalDatetime: '2026-09-01T01:30', airline: 'WN', flightNumber: '1234',
    });
  });

  it('passes untouched legs through unchanged, including TBD placeholders', () => {
    expect(legToPayload(leg({ departureAirport: 'TBD', departureDatetime: '2026-09-05T00:00:00Z', airline: undefined, flightNumber: '721' }))).toEqual({
      id: 'l1',
      departureAirport: 'TBD',
      departureDatetime: '2026-09-05T00:00:00Z',
      arrivalAirport: 'DAL',
      arrivalDatetime: '2026-08-29T10:00',
      airline: undefined,
      flightNumber: '721',
      checkPriceUrl: undefined,
    });
  });
});

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(draft())).toBeNull();
  });

  it('reports the first missing piece', () => {
    expect(validateDraft(draft({ date: '' }))).toBe('Enter the flight date');
    expect(validateDraft(draft({ arrivalAirport: ' ' }))).toBe('Enter both airport codes');
    expect(validateDraft(draft({ departureTime: '' }))).toBe('Enter the departure and arrival times');
  });

  it('rejects a same-day arrival before departure', () => {
    expect(validateDraft(draft({ departureTime: '23:00', arrivalTime: '01:30' }))).toBe('Arrival is before departure — choose +1 for a next-day arrival');
    expect(validateDraft(draft({ departureTime: '23:00', arrivalTime: '01:30', arrivalDayOffset: 1 }))).toBeNull();
  });
});

describe('applyLookup', () => {
  it('fills airports, date, times and offset from FlightStats details', () => {
    const result = applyLookup(draft({ flightCode: 'wn1234', departureAirport: '', arrivalAirport: '', departureTime: '', arrivalTime: '' }), {
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-31',
      departureAirport: 'DEN', arrivalAirport: 'MCO',
      departureDatetime: '2026-08-31T22:10:00.000', arrivalDatetime: '2026-09-01T03:05:00.000',
      sourceUrl: 'https://flightstats',
    });
    expect(result).toMatchObject({
      flightCode: 'WN1234', date: '2026-08-31', departureTime: '22:10', arrivalTime: '03:05', arrivalDayOffset: 1,
      departureAirport: 'DEN', arrivalAirport: 'MCO',
    });
  });

  it('keeps existing values when the lookup has none', () => {
    const before = draft();
    expect(applyLookup(before, { airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29', sourceUrl: '' })).toEqual(before);
  });
});

describe('display helpers', () => {
  it('formats clock times compactly', () => {
    expect(formatClock('2026-08-29T08:00')).toBe('8:00a');
    expect(formatClock('2026-08-29T12:05')).toBe('12:05p');
    expect(formatClock('00:30')).toBe('12:30a');
    expect(formatClock('')).toBe('');
  });

  it('formats a leg line with a next-day suffix', () => {
    expect(formatLegLine(leg())).toBe('WN1234 · DEN 8:00a → DAL 10:00a');
    expect(formatLegLine(leg({ airline: undefined, flightNumber: undefined, departureDatetime: '2026-08-31T23:00', arrivalDatetime: '2026-09-01T01:30' })))
      .toBe('DEN 11:00p → DAL 1:30a +1');
  });

  it('computes the layover between two drafts', () => {
    expect(draftLayover(draft(), draft({ departureTime: '12:15' }))).toBe(135);
    expect(draftLayover(draft(), draft({ departureTime: '' }))).toBeNull();
  });
});
