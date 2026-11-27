import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Container, Group, Loader, Text } from '@mantine/core';
import { Booking, Trip, TripDestination, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { buildFlightRows, flightTotals } from '../utils/flightRows';
import { buildLodgingRows, lodgingTotals, stayBooking } from '../utils/lodgingRows';
import { TripHeader } from '../components/TripHeader';
import { TripTravelersStrip } from '../components/TripTravelersStrip';
import TripPackingSection from '../components/TripPackingSection';
import { FlightsSection } from '../components/FlightsSection';
import { ElementDialog, ElementDialogTab } from '../components/ElementDialog';
import { FlightDetailsTab } from '../components/FlightDetailsTab';
import { FlightSeatsTab } from '../components/FlightSeatsTab';
import { AddElementDialog } from '../components/AddElementDialog';
import { BookingCard } from '../components/BookingCard';
import { LodgingSection } from '../components/LodgingSection';
import { AddLodgingDialog } from '../components/AddLodgingDialog';
import { LodgingDetailsTab } from '../components/LodgingDetailsTab';
import { LodgingRoomsTab } from '../components/LodgingRoomsTab';
import { LodgingPaymentsTab } from '../components/LodgingPaymentsTab';
import '../styles/trips.css';

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [elements, setElements] = useState<TripElement[]>([]);
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [destinations, setDestinations] = useState<TripDestination[]>([]);
  const [addingLodging, setAddingLodging] = useState(false);
  const [openRoomForm, setOpenRoomForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingBookings, setEditingBookings] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [roomsDirty, setRoomsDirty] = useState(false);
  const [editingPayments, setEditingPayments] = useState(false);
  const [paymentCount, setPaymentCount] = useState(0);
  const [bookingsVersion, setBookingsVersion] = useState(0);
  const [participantsVersion, setParticipantsVersion] = useState(0);

  // Silent reload keeps open dialogs mounted; only the first load shows the spinner.
  const load = useCallback(async (id: string, initial = false) => {
    try {
      if (initial) setLoading(true);
      const [tripData, elementsData, participantsData, bookingsData, destinationsData] = await Promise.all([
        tripApi.getTrip(id),
        tripApi.listElements(id),
        tripApi.listParticipants(id),
        tripApi.listBookings(id),
        tripApi.listDestinations(id),
      ]);
      setTrip(tripData);
      setElements(elementsData);
      setParticipants(participantsData);
      setBookings(bookingsData);
      setDestinations(destinationsData);
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

  const reload = useCallback(async () => {
    if (tripId) await load(tripId);
  }, [tripId, load]);

  // Bumping bookingsVersion makes each booking's transaction list refetch too.
  const reloadBookings = useCallback(async () => {
    if (!tripId) return;
    try {
      setBookings(await tripApi.listBookings(tripId));
      setBookingsVersion(v => v + 1);
    } catch (err) {
      setReloadError(err instanceof Error ? err.message : 'Failed to reload bookings');
    }
  }, [tripId]);

  const handleParticipantsFromBooking = (next: TripParticipant[]) => {
    setParticipants(next);
    setParticipantsVersion(v => v + 1);
  };

  const rows = useMemo(() => buildFlightRows(elements, bookings), [elements, bookings]);
  const totals = useMemo(() => flightTotals(elements, bookings), [elements, bookings]);
  const lodgingRows = useMemo(() => buildLodgingRows(elements, bookings, destinations), [elements, bookings, destinations]);
  const lodgingTotal = useMemo(() => lodgingTotals(elements, bookings), [elements, bookings]);
  const hiddenCount = elements.filter(e => e.elementType !== 'flight' && e.elementType !== 'hotel').length;
  const selected = elements.find(e => e.id === selectedId) ?? null;
  const selectedBookingCount = selected ? bookings.filter(b => b.elementIds.includes(selected.id)).length : 0;

  const openElement = (id: string | null, roomForm = false) => {
    setOpenRoomForm(roomForm);
    setDetailsDirty(false);
    setRoomsDirty(false);
    setEditingPayments(false);
    setPaymentCount(0);
    setSelectedId(id);
  };

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

  const flightTabs = (el: TripElement): ElementDialogTab[] => [
    {
      value: 'details',
      label: 'Details',
      content: (
        <FlightDetailsTab
          key={el.id}
          tripId={tripId}
          element={el}
          onChanged={reload}
          onDeleted={async () => {
            openElement(null);
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
          elementId={el.id}
          elements={elements}
          participants={participants}
          bookings={bookings}
          onParticipantsChanged={handleParticipantsFromBooking}
          refreshKey={bookingsVersion}
          onBookingsChanged={reloadBookings}
          onEditingChange={setEditingBookings}
        />
      ),
    },
    {
      value: 'seats',
      label: 'Seats',
      content: <FlightSeatsTab tripId={tripId} element={el} travelers={participants} />,
    },
  ];

  const hotelTabs = (el: TripElement): ElementDialogTab[] => {
    const booking = stayBooking(el, bookings);
    return [
      {
        value: 'details',
        label: 'Details',
        content: (
          <LodgingDetailsTab
            key={el.id}
            tripId={tripId}
            element={el}
            booking={booking}
            destinations={destinations}
            onChanged={reload}
            onDeleted={async () => {
              openElement(null);
              await reload();
            }}
            onEditingChange={setEditingDetails}
            onDirtyChange={setDetailsDirty}
          />
        ),
      },
      {
        value: 'rooms',
        label: 'Rooms',
        count: el.rooms?.length ?? 0,
        content: (
          <LodgingRoomsTab
            key={el.id}
            tripId={tripId}
            stay={el}
            participants={participants}
            onParticipantsChanged={handleParticipantsFromBooking}
            onRoomsChanged={reload}
            onEditingChange={setEditingBookings}
            onDirtyChange={setRoomsDirty}
            initialFormOpen={openRoomForm}
          />
        ),
      },
      {
        value: 'payments',
        label: 'Payments',
        count: paymentCount,
        content: (
          <LodgingPaymentsTab
            key={el.id}
            tripId={tripId}
            booking={booking}
            refreshKey={bookingsVersion}
            onChanged={reloadBookings}
            onCountChange={setPaymentCount}
            onEditingChange={setEditingPayments}
          />
        ),
      },
    ];
  };

  return (
    <Container size="lg" py="md">
      <TripHeader trip={trip} onAddFlight={() => setAdding(true)} onAddLodging={() => setAddingLodging(true)} />
      <TripTravelersStrip
        tripId={tripId}
        participants={participants}
        refreshKey={participantsVersion}
        onParticipantsChanged={setParticipants}
      />
      <TripPackingSection trip={trip} onChanged={reload} />

      {reloadError && (
        <Alert color="red" mt="sm" withCloseButton onClose={() => setReloadError(null)}>{reloadError}</Alert>
      )}

      {rows.length === 0 && lodgingRows.length === 0 ? (
        <Group mt="md" gap="xs">
          <Button variant="light" onClick={() => setAdding(true)}>Add a flight</Button>
          <Button variant="light" onClick={() => setAddingLodging(true)}>Add lodging</Button>
        </Group>
      ) : (
        <>
          {rows.length > 0 && <FlightsSection rows={rows} totalLabel={totals.label} onOpen={id => openElement(id)} />}
          {lodgingRows.length > 0 && <LodgingSection rows={lodgingRows} totalLabel={lodgingTotal.label} onOpen={id => openElement(id)} />}
        </>
      )}

      {hiddenCount > 0 && (
        <Text size="sm" c="dimmed" mt="sm">
          {hiddenCount === 1
            ? '1 other element hidden until its section is built'
            : `${hiddenCount} other elements hidden until their sections are built`}
        </Text>
      )}

      <AddLodgingDialog
        tripId={tripId}
        opened={addingLodging}
        destinations={destinations}
        onClose={() => setAddingLodging(false)}
        onCreated={async created => {
          setAddingLodging(false);
          await reload();
          openElement(created.id, true);
        }}
      />

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
          key={selected.id}
          opened
          onClose={() => openElement(null)}
          title={selected.name}
          swipeEnabled={!editingDetails && !editingBookings && !editingPayments}
          initialTab={selected.elementType === 'hotel' && openRoomForm ? 'rooms' : undefined}
          keepMounted={selected.elementType === 'hotel'}
          dirty={selected.elementType === 'hotel' && (detailsDirty || roomsDirty || editingPayments)}
          tabs={selected.elementType === 'hotel' ? hotelTabs(selected) : flightTabs(selected)}
        />
      )}
    </Container>
  );
}
