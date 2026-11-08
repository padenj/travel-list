import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Container, Loader, Text } from '@mantine/core';
import { Booking, Trip, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { buildFlightRows, flightTotals } from '../utils/flightRows';
import { TripHeader } from '../components/TripHeader';
import { TripTravelersStrip } from '../components/TripTravelersStrip';
import { FlightsSection } from '../components/FlightsSection';
import { ElementDialog } from '../components/ElementDialog';
import { FlightDetailsTab } from '../components/FlightDetailsTab';
import { FlightSeatsTab } from '../components/FlightSeatsTab';
import { AddElementDialog } from '../components/AddElementDialog';
import { BookingCard } from '../components/BookingCard';
import '../styles/trips.css';

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [elements, setElements] = useState<TripElement[]>([]);
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [bookingsVersion, setBookingsVersion] = useState(0);
  const [participantsVersion, setParticipantsVersion] = useState(0);

  // Silent reload keeps open dialogs mounted; only the first load shows the spinner.
  const load = useCallback(async (id: string, initial = false) => {
    try {
      if (initial) setLoading(true);
      const [tripData, elementsData, participantsData, bookingsData] = await Promise.all([
        tripApi.getTrip(id),
        tripApi.listElements(id),
        tripApi.listParticipants(id),
        tripApi.listBookings(id),
      ]);
      setTrip(tripData);
      setElements(elementsData);
      setParticipants(participantsData);
      setBookings(bookingsData);
      setLoadError(null);
      setReloadError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load trip';
      if (initial) setLoadError(message);
      else setReloadError(message);
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tripId) load(tripId, true);
  }, [tripId, load]);

  useEffect(() => {
    if (!tripId || bookingsVersion === 0) return;
    tripApi.listBookings(tripId).then(setBookings).catch(() => undefined);
  }, [tripId, bookingsVersion]);

  const reload = useCallback(async () => {
    if (tripId) await load(tripId);
  }, [tripId, load]);

  const handleParticipantsFromBooking = (next: TripParticipant[]) => {
    setParticipants(next);
    setParticipantsVersion(v => v + 1);
  };

  const rows = useMemo(() => buildFlightRows(elements, bookings), [elements, bookings]);
  const totals = useMemo(() => flightTotals(elements, bookings), [elements, bookings]);
  const hiddenCount = elements.filter(e => e.elementType !== 'flight').length;
  const selected = elements.find(e => e.id === selectedId) ?? null;
  const selectedBookingCount = selected ? bookings.filter(b => b.elementIds.includes(selected.id)).length : 0;

  if (loading) {
    return <Container size="lg" py="md"><Loader size="sm" aria-label="Loading" /></Container>;
  }

  if (loadError) {
    return (
      <Container size="lg" py="md">
        <Alert color="red" title="Couldn't load trip">{loadError}</Alert>
        <Button mt="sm" variant="default" onClick={() => tripId && load(tripId, true)}>Retry</Button>
      </Container>
    );
  }

  if (!trip || !tripId) {
    return <Container size="lg" py="md"><Text>Trip not found</Text></Container>;
  }

  return (
    <Container size="lg" py="md">
      <TripHeader trip={trip} onAdd={() => setAdding(true)} />
      <TripTravelersStrip
        tripId={tripId}
        participants={participants}
        refreshKey={participantsVersion}
        onParticipantsChanged={setParticipants}
      />

      {reloadError && (
        <Alert color="red" mt="sm" withCloseButton onClose={() => setReloadError(null)}>{reloadError}</Alert>
      )}

      {rows.length === 0 ? (
        <Button mt="md" variant="light" onClick={() => setAdding(true)}>Add your first flight</Button>
      ) : (
        <FlightsSection rows={rows} totalLabel={totals.label} onOpen={setSelectedId} />
      )}

      {hiddenCount > 0 && (
        <Text size="sm" c="dimmed" mt="sm">
          {hiddenCount === 1
            ? '1 other element hidden until its section is built'
            : `${hiddenCount} other elements hidden until their sections are built`}
        </Text>
      )}

      <AddElementDialog
        tripId={tripId}
        opened={adding}
        onClose={() => setAdding(false)}
        onCreated={async () => {
          setAdding(false);
          await reload();
        }}
      />

      {selected && (
        <ElementDialog
          opened
          onClose={() => setSelectedId(null)}
          title={selected.name}
          swipeEnabled={!editingDetails}
          tabs={[
            {
              value: 'details',
              label: 'Details',
              content: (
                <FlightDetailsTab
                  key={selected.id}
                  tripId={tripId}
                  element={selected}
                  onChanged={reload}
                  onDeleted={async () => {
                    setSelectedId(null);
                    await reload();
                  }}
                  onEditingChange={setEditingDetails}
                />
              ),
            },
            {
              value: 'bookings',
              label: 'Bookings',
              count: selectedBookingCount,
              content: (
                <BookingCard
                  tripId={tripId}
                  elementId={selected.id}
                  elements={elements}
                  participants={participants}
                  onParticipantsChanged={handleParticipantsFromBooking}
                  refreshKey={bookingsVersion}
                  onBookingsChanged={() => setBookingsVersion(v => v + 1)}
                />
              ),
            },
            {
              value: 'seats',
              label: 'Seats',
              content: <FlightSeatsTab tripId={tripId} element={selected} travelers={participants} />,
            },
          ]}
        />
      )}
    </Container>
  );
}
