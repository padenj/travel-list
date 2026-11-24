import { useId, useState } from 'react';
import {
  Alert, Autocomplete, Button, Checkbox, Chip, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Textarea,
} from '@mantine/core';
import { AmenityKey, Booking, Refundability, RoomType, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { BedsEditor } from './BedsEditor';
import { CouponsEditor } from './CouponsEditor';
import { AMENITY_OPTIONS, BOOKING_SITES, REFUNDABILITY_OPTIONS, ROOM_TYPE_OPTIONS } from '../utils/lodging';
import { RoomDraft, emptyRoomDraft, roomDraftFromBooking, roomPayload, validateRoomDraft } from '../utils/roomDraft';
import { bookedTravelers, bookingLabel } from '../utils/bookingCoverage';

interface RoomFormProps {
  tripId: string;
  stayId: string;
  participants: TripParticipant[];
  bookings: Booking[];
  booking?: Booking;
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}

function Heading({ children }: { children: string }) {
  return <Text size="sm" fw={600} mt="sm" mb={4}>{children}</Text>;
}

export function RoomForm({ tripId, stayId, participants, bookings, booking, onParticipantsChanged, onSaved, onCancel }: RoomFormProps) {
  const uid = useId();
  const [draft, setDraft] = useState<RoomDraft>(() => (booking ? roomDraftFromBooking(booking) : emptyRoomDraft()));
  const [newTravelerName, setNewTravelerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RoomDraft>(key: K, value: RoomDraft[K]) => setDraft(prev => ({ ...prev, [key]: value }));
  const taken = bookedTravelers(bookings, [stayId], booking?.id);

  const toggleTraveler = (id: string) =>
    set('travelerIds', draft.travelerIds.includes(id) ? draft.travelerIds.filter(x => x !== id) : [...draft.travelerIds, id]);

  const save = async () => {
    const problem = validateRoomDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      let travelerIds = draft.travelerIds;
      if (newTravelerName.trim()) {
        const created = await tripApi.createParticipant(tripId, { displayName: newTravelerName.trim() });
        onParticipantsChanged([...participants, created]);
        travelerIds = [...travelerIds, created.id];
        // Keep the new traveler selected so a retry doesn't create them twice.
        setDraft(prev => ({ ...prev, travelerIds }));
        setNewTravelerName('');
      }
      const payload = roomPayload({ ...draft, travelerIds }, stayId);
      if (booking) await tripApi.updateBooking(tripId, booking.id, payload);
      else await tripApi.createBooking(tripId, payload);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save room');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper withBorder p="sm" mt="xs">
      {error && <Alert color="red" mb="xs">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <div>
          <Heading>Booking</Heading>
          <Stack gap="xs">
            <Autocomplete id={`${uid}-site`} label="Booking site" data={BOOKING_SITES} value={draft.bookingSite} onChange={value => set('bookingSite', value)} />
            <TextInput id={`${uid}-itin`} label="Site itinerary #" value={draft.siteItineraryNumber} onChange={e => set('siteItineraryNumber', e.currentTarget.value)} />
            <TextInput id={`${uid}-conf`} label="Hotel confirmation #" value={draft.confirmationNumber} onChange={e => set('confirmationNumber', e.currentTarget.value)} />
            <TextInput id={`${uid}-loyalty`} label="Loyalty program" value={draft.loyaltyProgram} onChange={e => set('loyaltyProgram', e.currentTarget.value)} />
          </Stack>

          <Heading>Price</Heading>
          <Stack gap="xs">
            <TextInput id={`${uid}-cash`} label="Advertised total (cash)" type="number" step="0.01" value={draft.priceCash} onChange={e => set('priceCash', e.currentTarget.value)} />
            <TextInput id={`${uid}-points`} label="Advertised total (points)" type="number" step="1" value={draft.pricePoints} onChange={e => set('pricePoints', e.currentTarget.value)} />
            <Checkbox id={`${uid}-taxes`} label="Includes taxes & fees" checked={draft.includesTaxes} onChange={e => set('includesTaxes', e.currentTarget.checked)} />
          </Stack>

          <Heading>Room</Heading>
          <Stack gap="xs">
            <Select id={`${uid}-type`} label="Room type" placeholder="Not set" clearable data={ROOM_TYPE_OPTIONS}
              value={draft.roomType} onChange={value => set('roomType', value as RoomType | null)} />
            <div>
              <Text size="sm" fw={500}>Beds</Text>
              <BedsEditor beds={draft.beds} onChange={beds => set('beds', beds)} />
            </div>
            <TextInput id={`${uid}-desc`} label="Room description" placeholder="e.g. Ocean view, high floor" value={draft.roomDescription} onChange={e => set('roomDescription', e.currentTarget.value)} />
          </Stack>
        </div>

        <div>
          <Heading>Amenities</Heading>
          <Chip.Group multiple value={draft.amenities} onChange={value => set('amenities', value as AmenityKey[])}>
            <Group gap={6}>
              {AMENITY_OPTIONS.map(o => <Chip key={o.value} value={o.value} size="xs">{o.label}</Chip>)}
            </Group>
          </Chip.Group>
          <TextInput id={`${uid}-other`} mt="xs" label="Other amenities" value={draft.otherAmenities} onChange={e => set('otherAmenities', e.currentTarget.value)} />

          <Heading>Cancellation</Heading>
          <Stack gap="xs">
            <SegmentedControl
              aria-label="Refundability"
              fullWidth
              size="xs"
              data={[...REFUNDABILITY_OPTIONS, { value: '', label: 'Unset' }]}
              value={draft.refundability ?? ''}
              onChange={value => set('refundability', (value || null) as Refundability | null)}
            />
            <Group gap="xs" grow>
              <TextInput id={`${uid}-cancel-date`} label="Cancel by date" type="date" value={draft.cancelDate} onChange={e => set('cancelDate', e.currentTarget.value)} />
              <TextInput id={`${uid}-cancel-time`} label="Cancel by time" type="time" value={draft.cancelTime} onChange={e => set('cancelTime', e.currentTarget.value)} />
            </Group>
            <Textarea id={`${uid}-policy`} label="Policy" autosize minRows={1} value={draft.cancellationPolicy} onChange={e => set('cancellationPolicy', e.currentTarget.value)} />
          </Stack>

          <Heading>Coupons</Heading>
          <CouponsEditor coupons={draft.coupons} onChange={coupons => set('coupons', coupons)} />
        </div>
      </SimpleGrid>

      <Heading>Travelers</Heading>
      <Group gap="sm">
        {participants.map(p => {
          const other = taken.get(p.id);
          const checked = draft.travelerIds.includes(p.id);
          return (
            <Checkbox
              key={p.id}
              label={other ? `${p.displayName} (in room ${bookingLabel(other)})` : p.displayName}
              checked={checked}
              disabled={Boolean(other) && !checked}
              onChange={() => toggleTraveler(p.id)}
            />
          );
        })}
      </Group>
      <TextInput id={`${uid}-new-traveler`} mt="xs" label="+ New traveler" placeholder="Optional" value={newTravelerName} onChange={e => setNewTravelerName(e.currentTarget.value)} />

      <Textarea id={`${uid}-notes`} mt="xs" label="Notes" autosize minRows={1} value={draft.notes} onChange={e => set('notes', e.currentTarget.value)} />

      <Group mt="sm" justify="flex-end">
        <Button variant="default" size="xs" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={save} loading={saving}>Save room</Button>
      </Group>
    </Paper>
  );
}
