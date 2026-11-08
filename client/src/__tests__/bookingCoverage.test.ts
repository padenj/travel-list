import { describe, it, expect } from 'vitest';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import {
  bookedTravelers, bookingLabel, flightDateLabel, flightOptionLabel, sortFlightsByDate, unbookedTravelers,
} from '../utils/bookingCoverage';

const legAt = (id: string, departureDatetime: string) => ({
  id, elementId: '', legOrder: 1, departureAirport: 'A', departureDatetime, arrivalAirport: 'B', arrivalDatetime: departureDatetime, createdAt: '', updatedAt: '',
});

const flight = (id: string, name: string, dates: string[]): TripElement => ({
  id, tripId: 't', elementType: 'flight', name, sortPosition: 0, createdAt: '', updatedAt: '',
  legs: dates.map((d, i) => legAt(`${id}-l${i}`, d)),
});

const booking = (id: string, elementIds: string[], travelerIds: string[], conf: string | null = null): Booking => ({
  id, tripId: 't', confirmationNumber: conf, advertisedPriceCash: null, advertisedPricePoints: null, loyaltyProgram: null,
  notes: null, createdAt: '', updatedAt: '', elementIds, travelerIds, currentConfirmationNumber: conf, actualTotalCash: 0, actualTotalPoints: 0,
});

const people: TripParticipant[] = [
  { id: 'p1', tripId: 't', displayName: 'Alice', createdAt: '' },
  { id: 'p2', tripId: 't', displayName: 'Bob', createdAt: '' },
];

describe('bookingCoverage', () => {
  const out = flight('f1', 'DEN → MCO', ['2026-08-29T08:00', '2026-08-29T11:30']);
  const back = flight('f2', 'MCO → DEN', ['2026-09-05T18:00']);
  const tbd = flight('f3', 'Home', []);
  const hotel: TripElement = { id: 'h1', tripId: 't', elementType: 'hotel', name: 'Diamante', sortPosition: 0, createdAt: '', updatedAt: '' };

  it('sorts flights by first departure, undated last, and drops non-flights', () => {
    expect(sortFlightsByDate([tbd, back, hotel, out]).map(f => f.id)).toEqual(['f1', 'f2', 'f3']);
  });

  it('labels flights for checkboxes and the covers line', () => {
    expect(flightDateLabel(out)).toBe('Aug 29');
    expect(flightDateLabel(tbd)).toBe('');
    expect(flightOptionLabel(out)).toBe('DEN → MCO · Aug 29 · 2 legs');
    expect(flightOptionLabel(back)).toBe('MCO → DEN · Sep 5 · 1 leg');
    expect(flightOptionLabel(tbd)).toBe('Home');
  });

  it('labels bookings by current confirmation number', () => {
    expect(bookingLabel(booking('b1', [], [], 'ABC123'))).toBe('ABC123');
    expect(bookingLabel(booking('b1', [], []))).toBe('no confirmation #');
  });

  it('maps travelers to the booking that already covers any of the flights', () => {
    const b1 = booking('b1', ['f1', 'f2'], ['p1'], 'ABC');
    const b2 = booking('b2', ['f2'], ['p2'], 'XYZ');
    expect([...bookedTravelers([b1, b2], ['f1']).entries()]).toEqual([['p1', b1]]);
    expect([...bookedTravelers([b1, b2], ['f2']).keys()].sort()).toEqual(['p1', 'p2']);
    expect([...bookedTravelers([b1, b2], ['f2'], 'b1').keys()]).toEqual(['p2']);
  });

  it('lists trip travelers not booked on a flight', () => {
    const b1 = booking('b1', ['f1'], ['p1']);
    expect(unbookedTravelers([b1], 'f1', people).map(p => p.displayName)).toEqual(['Bob']);
    expect(unbookedTravelers([b1], 'f2', people).map(p => p.displayName)).toEqual(['Alice', 'Bob']);
  });
});
