import { describe, it, expect } from 'vitest';
import { flightTitle } from './flightTitle';

describe('flightTitle', () => {
  it('uses the first origin and last destination, uppercased', () => {
    expect(flightTitle([{ departureAirport: 'den', arrivalAirport: 'mco' }])).toBe('DEN → MCO');
    expect(flightTitle([
      { departureAirport: 'DEN', arrivalAirport: 'DAL' },
      { departureAirport: 'DAL', arrivalAirport: ' SJD ' },
    ])).toBe('DEN → SJD');
  });

  it('returns null when an end is unknown or there are no legs', () => {
    expect(flightTitle([])).toBeNull();
    expect(flightTitle([{ departureAirport: 'TBD', arrivalAirport: 'SJD' }])).toBeNull();
    expect(flightTitle([{ departureAirport: 'DEN', arrivalAirport: '' }])).toBeNull();
    expect(flightTitle([{ departureAirport: 'DEN', arrivalAirport: null }])).toBeNull();
  });
});
