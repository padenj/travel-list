import { Badge, Text, Title } from '@mantine/core';
import { Trip } from '../types/trip';
import { formatNights, formatTripDateRange, nightsBetween } from '../utils/tripDates';
import { AddMenu } from './AddMenu';
import classes from './TripHeader.module.css';

interface TripHeaderProps {
  trip: Trip;
  onAddFlight: () => void;
  onAddLodging: () => void;
}

export function TripHeader({ trip, onAddFlight, onAddLodging }: TripHeaderProps) {
  const range = formatTripDateRange(trip.startDate, trip.endDate);
  const nights = nightsBetween(trip.startDate, trip.endDate);

  return (
    <div className={classes.header}>
      <div>
        <div className={classes.meta}>
          <Title order={2}>{trip.name}</Title>
          {trip.tripType && <Badge variant="light">{trip.tripType}</Badge>}
        </div>
        {(range || trip.description) && (
          <Text size="sm" c="dimmed">
            {range}
            {range && nights !== null ? ` · ${formatNights(nights)}` : ''}
            {range && trip.description ? ' · ' : ''}
            {trip.description}
          </Text>
        )}
      </div>
      <AddMenu className={classes.add} onAddFlight={onAddFlight} onAddLodging={onAddLodging} />
    </div>
  );
}
