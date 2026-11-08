import { Text } from '@mantine/core';
import { TripElement, TripParticipant } from '../types/trip';
import { FlightSeatGrid } from './FlightSeatGrid';
import { formatLegTime } from '../utils/flightLegs';

interface FlightSeatsTabProps {
  tripId: string;
  element: TripElement;
  travelers: TripParticipant[];
}

export function FlightSeatsTab({ tripId, element, travelers }: FlightSeatsTabProps) {
  const legs = element.legs ?? [];
  if (legs.length === 0) {
    return <Text c="dimmed">Add legs to this flight to assign seats.</Text>;
  }

  return (
    <div>
      {legs.map(leg => (
        <div key={leg.id} style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
          <Text fw={600} size="sm">
            {leg.departureAirport || '—'} → {leg.arrivalAirport || '—'}
            {leg.departureDatetime ? ` · ${formatLegTime(leg.departureDatetime)}` : ''}
          </Text>
          <FlightSeatGrid tripId={tripId} legId={leg.id} travelers={travelers} />
        </div>
      ))}
    </div>
  );
}
