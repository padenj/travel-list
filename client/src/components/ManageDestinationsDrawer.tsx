import { useEffect, useState } from 'react';
import { Drawer, Loader, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { tripApi } from '../api/tripApi';
import type { Trip } from '../types/trip';
import TripPackingSection from './TripPackingSection';

// Above GlobalListEditDrawer (3000), which can open this drawer.
export const DESTINATIONS_DRAWER_Z = 3100;

export interface ManageDestinationsDrawerProps {
  opened: boolean;
  tripId: string | null;
  /** The opener refreshes here. */
  onClose: () => void;
}

export default function ManageDestinationsDrawer({ opened, tripId, onClose }: ManageDestinationsDrawerProps) {
  const isMobile = useMediaQuery('(max-width: 48em)', undefined, { getInitialValueInEffect: false });
  const [trip, setTrip] = useState<Trip | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!opened || !tripId) return;
    let cancelled = false;
    setTrip(null);
    setFailed(false);
    tripApi
      .getTrip(tripId)
      .then(t => {
        if (!cancelled) setTrip(t);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [opened, tripId]);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size={isMobile ? '100%' : '80%'}
      padding="md"
      zIndex={DESTINATIONS_DRAWER_Z}
      title={trip ? `${trip.name} destinations` : 'Destinations'}
    >
      {failed && <Text size="sm" c="red">Couldn't load this trip.</Text>}
      {!failed && !trip && <Loader size="sm" aria-label="Loading trip" />}
      {trip && <TripPackingSection trip={trip} onOpenList={onClose} zIndex={DESTINATIONS_DRAWER_Z} />}
    </Drawer>
  );
}
