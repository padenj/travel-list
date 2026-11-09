import { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Group, Paper, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { bookedTravelers, bookingLabel, flightOptionLabel, sortFlightsByDate } from '../utils/bookingCoverage';

interface BookingFormProps {
  tripId: string;
  elements: TripElement[];
  participants: TripParticipant[];
  bookings: Booking[];
  booking?: Booking;
  defaultElementId?: string;
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
}

// Edit mode when `booking` is given; otherwise creates a booking pre-checked for `defaultElementId`.
export function BookingForm({
  tripId, elements, participants, bookings, booking, defaultElementId, onParticipantsChanged, onSaved, onCancel,
}: BookingFormProps) {
  const flights = useMemo(() => sortFlightsByDate(elements), [elements]);
  const [confirmationNumber, setConfirmationNumber] = useState(booking?.confirmationNumber ?? '');
  const [loyaltyProgram, setLoyaltyProgram] = useState(booking?.loyaltyProgram ?? '');
  const [priceCash, setPriceCash] = useState(booking?.advertisedPriceCash != null ? String(booking.advertisedPriceCash) : '');
  const [pricePoints, setPricePoints] = useState(booking?.advertisedPricePoints != null ? String(booking.advertisedPricePoints) : '');
  const [notes, setNotes] = useState(booking?.notes ?? '');
  const [elementIds, setElementIds] = useState<string[]>(() => {
    const initial = booking ? booking.elementIds : defaultElementId ? [defaultElementId] : [];
    // Defensive: drop ids for flights that no longer exist (e.g. soft-deleted) so a stale
    // id with no checkbox can't silently be resubmitted on save.
    return initial.filter(id => flights.some(f => f.id === id));
  });
  const [travelerIds, setTravelerIds] = useState<string[]>(() => {
    if (booking) return booking.travelerIds;
    const taken = bookedTravelers(bookings, defaultElementId ? [defaultElementId] : []);
    return participants.filter(p => !taken.has(p.id)).map(p => p.id);
  });
  const [newTravelerName, setNewTravelerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taken = bookedTravelers(bookings, elementIds, booking?.id);

  const save = async () => {
    if (elementIds.length === 0) {
      setError('Select at least one flight');
      return;
    }
    if (travelerIds.length === 0 && !newTravelerName.trim()) {
      setError('Select or add at least one traveler');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const ids = [...travelerIds];
      if (newTravelerName.trim()) {
        const created = await tripApi.createParticipant(tripId, { displayName: newTravelerName.trim() });
        onParticipantsChanged([...participants, created]);
        // Keep the new traveler selected and clear the name so a retry doesn't create them twice.
        setTravelerIds(prev => [...prev, created.id]);
        setNewTravelerName('');
        ids.push(created.id);
      }
      const payload = {
        confirmationNumber: confirmationNumber.trim() || null,
        loyaltyProgram: loyaltyProgram.trim() || null,
        advertisedPriceCash: parseNumber(priceCash),
        advertisedPricePoints: parseNumber(pricePoints),
        notes: notes.trim() || null,
        elementIds,
        travelerIds: ids,
      };
      if (booking) {
        await tripApi.updateBooking(tripId, booking.id, payload);
      } else {
        await tripApi.createBooking(tripId, payload);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save booking');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper withBorder p="sm" mt="xs">
      {error && <Alert color="red" mb="xs">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        <TextInput label="Confirmation number" value={confirmationNumber} onChange={e => setConfirmationNumber(e.currentTarget.value)} />
        <TextInput label="Loyalty program" value={loyaltyProgram} onChange={e => setLoyaltyProgram(e.currentTarget.value)} />
        <TextInput label="Advertised price per person (cash)" type="number" step="0.01" value={priceCash} onChange={e => setPriceCash(e.currentTarget.value)} />
        <TextInput label="Advertised price per person (points)" type="number" step="1" value={pricePoints} onChange={e => setPricePoints(e.currentTarget.value)} />
      </SimpleGrid>
      <Textarea mt="xs" label="Notes" autosize minRows={1} value={notes} onChange={e => setNotes(e.currentTarget.value)} />

      <Text size="sm" fw={600} mt="sm">Flights</Text>
      <Stack gap={6} mt={4}>
        {flights.map(flight => (
          <Checkbox
            key={flight.id}
            label={flightOptionLabel(flight)}
            checked={elementIds.includes(flight.id)}
            onChange={() => setElementIds(prev => toggle(prev, flight.id))}
          />
        ))}
      </Stack>

      <Text size="sm" fw={600} mt="sm">Travelers</Text>
      <Group gap="sm" mt={4}>
        {participants.map(p => {
          const other = taken.get(p.id);
          const checked = travelerIds.includes(p.id);
          return (
            <Checkbox
              key={p.id}
              label={other ? `${p.displayName} (on ${bookingLabel(other)})` : p.displayName}
              checked={checked}
              disabled={Boolean(other) && !checked}
              onChange={() => setTravelerIds(prev => toggle(prev, p.id))}
            />
          );
        })}
      </Group>
      <TextInput
        mt="xs"
        label="+ New traveler"
        placeholder="Name of traveler not yet on the trip"
        value={newTravelerName}
        onChange={e => setNewTravelerName(e.currentTarget.value)}
      />

      <Group mt="sm" justify="flex-end">
        <Button variant="default" size="xs" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={save} loading={saving}>Save booking</Button>
      </Group>
    </Paper>
  );
}
