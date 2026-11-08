import { Booking, TripElement, TripParticipant } from '../types/trip';

function firstDeparture(element: TripElement): string {
  return element.legs?.[0]?.departureDatetime ?? '';
}

// Flights only, earliest first; flights without legs go last in their original order.
export function sortFlightsByDate(elements: TripElement[]): TripElement[] {
  return elements
    .filter(e => e.elementType === 'flight')
    .map((element, index) => ({ element, index, when: firstDeparture(element) }))
    .sort((a, b) => {
      if (a.when && b.when && a.when !== b.when) return a.when < b.when ? -1 : 1;
      if (a.when && !b.when) return -1;
      if (!a.when && b.when) return 1;
      return a.index - b.index;
    })
    .map(item => item.element);
}

// "Aug 29" from the first leg's departure date (no timezone shift).
export function flightDateLabel(element: TripElement): string {
  const match = firstDeparture(element).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const [year, month, day] = match.slice(1).map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// "DEN → MCO · Aug 29 · 2 legs"
export function flightOptionLabel(element: TripElement): string {
  const count = element.legs?.length ?? 0;
  const legs = count > 0 ? `${count} leg${count === 1 ? '' : 's'}` : '';
  return [element.name, flightDateLabel(element), legs].filter(Boolean).join(' · ');
}

export function bookingLabel(booking: Booking): string {
  return booking.currentConfirmationNumber || 'no confirmation #';
}

// participantId -> the other booking that already has them on any of `elementIds`.
export function bookedTravelers(bookings: Booking[], elementIds: string[], excludeBookingId?: string): Map<string, Booking> {
  const result = new Map<string, Booking>();
  for (const booking of bookings) {
    if (booking.id === excludeBookingId) continue;
    if (!booking.elementIds.some(id => elementIds.includes(id))) continue;
    for (const participantId of booking.travelerIds) {
      if (!result.has(participantId)) result.set(participantId, booking);
    }
  }
  return result;
}

export function unbookedTravelers(bookings: Booking[], elementId: string, participants: TripParticipant[]): TripParticipant[] {
  const booked = bookedTravelers(bookings, [elementId]);
  return participants.filter(p => !booked.has(p.id));
}
