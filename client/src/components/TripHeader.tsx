import { Badge, Button, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Trip } from '../types/trip';
import { formatNights, formatTripDateRange, nightsBetween } from '../utils/tripDates';
import classes from './TripHeader.module.css';

interface TripHeaderProps {
  trip: Trip;
  onAdd: () => void;
  addLabel?: string;
}

export function TripHeader({ trip, onAdd, addLabel = 'Add flight' }: TripHeaderProps) {
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
      <Button className={classes.add} leftSection={<IconPlus size={16} />} onClick={onAdd}>
        {addLabel}
      </Button>
    </div>
  );
}
