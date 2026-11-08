import { useState, useEffect, useCallback } from 'react';
import { Alert, Badge, Button, Checkbox, Group, Paper, SimpleGrid, Text, TextInput } from '@mantine/core';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { BookingTransactionList } from './BookingTransactionList';
import { bookingMoneyLine } from '../utils/bookingSummary';

interface BookingCardProps {
  tripId: string;
  elementId: string;
  elements: TripElement[];
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  refreshKey?: number;
  onBookingsChanged?: () => void;
}

function parseNumberInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BookingCard({ tripId, elementId, elements, participants, onParticipantsChanged, refreshKey = 0, onBookingsChanged }: BookingCardProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [advertisedPriceCash, setAdvertisedPriceCash] = useState('');
  const [advertisedPricePoints, setAdvertisedPricePoints] = useState('');
  const [loyaltyProgram, setLoyaltyProgram] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>([]);
  const [newTravelerName, setNewTravelerName] = useState('');
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([elementId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await tripApi.listBookings(tripId, elementId);
    setBookings(data);
  }, [tripId, elementId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleBookingsChanged = useCallback(async () => {
    await load();
    onBookingsChanged?.();
  }, [load, onBookingsChanged]);

  const toggleTraveler = (participantId: string) => {
    setSelectedTravelerIds(prev =>
      prev.includes(participantId) ? prev.filter(id => id !== participantId) : [...prev, participantId]
    );
  };

  const toggleElement = (id: string) => {
    setSelectedElementIds(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const saveBooking = async () => {
    try {
      setSaving(true);
      setError(null);
      const travelerIds = [...selectedTravelerIds];

      if (newTravelerName.trim()) {
        const created = await tripApi.createParticipant(tripId, { displayName: newTravelerName.trim() });
        travelerIds.push(created.id);
        onParticipantsChanged([...participants, created]);
      }

      if (travelerIds.length === 0) {
        setError('Select or add at least one traveler');
        return;
      }
      if (selectedElementIds.length === 0) {
        setError('Select at least one element this booking covers');
        return;
      }

      await tripApi.createBooking(tripId, {
        confirmationNumber: confirmationNumber.trim() || undefined,
        advertisedPriceCash: parseNumberInput(advertisedPriceCash),
        advertisedPricePoints: parseNumberInput(advertisedPricePoints),
        loyaltyProgram: loyaltyProgram.trim() || undefined,
        notes: notes.trim() || undefined,
        elementIds: selectedElementIds,
        travelerIds,
      });

      setConfirmationNumber('');
      setAdvertisedPriceCash('');
      setAdvertisedPricePoints('');
      setLoyaltyProgram('');
      setNotes('');
      setSelectedTravelerIds([]);
      setNewTravelerName('');
      setSelectedElementIds([elementId]);
      setShowForm(false);
      await handleBookingsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save booking');
    } finally {
      setSaving(false);
    }
  };

  const otherElements = elements.filter(e => e.id !== elementId && e.elementType === 'flight');

  return (
    <div>
      <Group justify="flex-end">
        <Button size="compact-sm" variant="light" onClick={() => setShowForm(prev => !prev)}>
          {showForm ? 'Cancel' : '+ Booking'}
        </Button>
      </Group>

      {error && <Alert color="red" mt="xs">{error}</Alert>}

      {showForm && (
        <Paper withBorder p="sm" mt="xs">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <TextInput id={`booking-conf-${elementId}`} label="Confirmation number" value={confirmationNumber} onChange={e => setConfirmationNumber(e.currentTarget.value)} />
            <TextInput id={`booking-loyalty-${elementId}`} label="Loyalty program" value={loyaltyProgram} onChange={e => setLoyaltyProgram(e.currentTarget.value)} />
            <TextInput id={`booking-price-cash-${elementId}`} label="Advertised price per person (cash)" type="number" step="0.01" value={advertisedPriceCash} onChange={e => setAdvertisedPriceCash(e.currentTarget.value)} />
            <TextInput id={`booking-price-points-${elementId}`} label="Advertised price per person (points)" type="number" step="1" value={advertisedPricePoints} onChange={e => setAdvertisedPricePoints(e.currentTarget.value)} />
          </SimpleGrid>
          <TextInput mt="xs" id={`booking-notes-${elementId}`} label="Notes" value={notes} onChange={e => setNotes(e.currentTarget.value)} />

          <Text size="sm" fw={600} mt="sm">Travelers on this booking</Text>
          <Group gap="sm" mt={4}>
            {participants.map(p => (
              <Checkbox key={p.id} label={p.displayName} checked={selectedTravelerIds.includes(p.id)} onChange={() => toggleTraveler(p.id)} />
            ))}
          </Group>
          <TextInput
            mt="xs"
            id={`booking-new-traveler-${elementId}`}
            label="+ New traveler"
            placeholder="Name of traveler not yet on the trip"
            value={newTravelerName}
            onChange={e => setNewTravelerName(e.currentTarget.value)}
          />

          {otherElements.length > 0 && (
            <>
              <Text size="sm" fw={600} mt="sm">Also applies to</Text>
              <Group gap="sm" mt={4}>
                {otherElements.map(el => (
                  <Checkbox key={el.id} label={el.name} checked={selectedElementIds.includes(el.id)} onChange={() => toggleElement(el.id)} />
                ))}
              </Group>
            </>
          )}

          <Button mt="sm" size="xs" onClick={saveBooking} loading={saving}>Save booking</Button>
        </Paper>
      )}

      {bookings.length === 0 && !showForm && (
        <Text size="sm" c="dimmed" mt="xs">No bookings yet for this flight</Text>
      )}

      {bookings.map(booking => {
        const travelerNames = booking.travelerIds.map(id => participants.find(p => p.id === id)?.displayName || id);
        const otherLinkedElements = booking.elementIds
          .filter(id => id !== elementId)
          .map(id => elements.find(e => e.id === id))
          .filter((e): e is TripElement => !!e);

        return (
          <Paper key={booking.id} withBorder p="xs" mt="xs">
            <Group gap="xs">
              <Text fw={700}>{booking.currentConfirmationNumber || 'No confirmation number'}</Text>
              {booking.confirmationNumber && booking.confirmationNumber !== booking.currentConfirmationNumber && (
                <Text size="xs" c="dimmed">{`orig ${booking.confirmationNumber}`}</Text>
              )}
              {travelerNames.map((name, index) => (
                <Badge key={`${name}-${index}`} variant="outline" tt="none" size="sm">{name}</Badge>
              ))}
            </Group>
            <Text size="sm" c="dimmed">{bookingMoneyLine(booking)}</Text>
            {otherLinkedElements.length > 0 && (
              <Text size="xs" c="dimmed">
                Also covers:{' '}
                {otherLinkedElements.map((e, index) => (
                  <span key={e.id}>
                    {index > 0 ? ', ' : ''}
                    {e.name}
                  </span>
                ))}
              </Text>
            )}
            <BookingTransactionList
              tripId={tripId}
              bookingId={booking.id}
              originalConfirmationNumber={booking.confirmationNumber}
              refreshKey={refreshKey}
              onChanged={handleBookingsChanged}
            />
          </Paper>
        );
      })}
    </div>
  );
}
