import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Chip, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import { LodgingRoom, RoomAmenity, RoomType, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { BedsEditor } from './BedsEditor';
import { ROOM_AMENITY_OPTIONS, ROOM_TYPE_OPTIONS } from '../utils/lodging';
import { RoomDraft, emptyRoomDraft, isRoomDraftDirty, roomDraftFromRoom, roomPayload, validateRoomDraft } from '../utils/roomDraft';

interface RoomFormProps {
  tripId: string;
  stayId: string;
  room?: LodgingRoom;
  takenTravelerIds: Set<string>;
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function Heading({ children }: { children: string }) {
  return <Text size="sm" fw={600} mt="sm" mb={4}>{children}</Text>;
}

export function RoomForm({
  tripId, stayId, room, takenTravelerIds, participants, onParticipantsChanged, onSaved, onCancel, onDirtyChange,
}: RoomFormProps) {
  const uid = useId();
  const [initial] = useState<RoomDraft>(() => (room ? roomDraftFromRoom(room) : emptyRoomDraft()));
  const [draft, setDraft] = useState<RoomDraft>(initial);
  const [newTravelerName, setNewTravelerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const set = <K extends keyof RoomDraft>(key: K, value: RoomDraft[K]) => setDraft(prev => ({ ...prev, [key]: value }));

  const dirty = isRoomDraftDirty(initial, draft, newTravelerName);
  useEffect(() => {
    onDirtyChangeRef.current(dirty);
  }, [dirty]);
  useEffect(() => () => onDirtyChangeRef.current(false), []);

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
      const payload = roomPayload({ ...draft, travelerIds });
      if (room) await tripApi.updateRoom(tripId, room.id, payload);
      else await tripApi.createRoom(tripId, stayId, payload);
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
      <Stack gap="xs">
        <Select id={`${uid}-type`} label="Room type" placeholder="Not set" clearable data={ROOM_TYPE_OPTIONS}
          value={draft.roomType} onChange={value => set('roomType', value as RoomType | null)} />
        <div>
          <Text size="sm" fw={500}>Beds</Text>
          <BedsEditor beds={draft.beds} onChange={beds => set('beds', beds)} />
        </div>
        <TextInput id={`${uid}-desc`} label="Room description" placeholder="e.g. Ocean view, high floor" value={draft.description}
          onChange={e => set('description', e.currentTarget.value)} />
      </Stack>

      <Heading>Room amenities</Heading>
      <Chip.Group multiple value={draft.amenities} onChange={value => set('amenities', value as RoomAmenity[])}>
        <Group gap={6}>
          {ROOM_AMENITY_OPTIONS.map(o => <Chip key={o.value} value={o.value} size="xs">{o.label}</Chip>)}
        </Group>
      </Chip.Group>
      <TextInput id={`${uid}-other`} mt="xs" label="Other amenities" value={draft.otherAmenities}
        onChange={e => set('otherAmenities', e.currentTarget.value)} />

      <Heading>Travelers</Heading>
      <Group gap="sm">
        {participants.map(p => {
          const taken = takenTravelerIds.has(p.id);
          const checked = draft.travelerIds.includes(p.id);
          return (
            <Checkbox
              key={p.id}
              label={taken ? `${p.displayName} (in another room)` : p.displayName}
              checked={checked}
              disabled={taken && !checked}
              onChange={() => toggleTraveler(p.id)}
            />
          );
        })}
      </Group>
      <TextInput id={`${uid}-new-traveler`} mt="xs" label="+ New traveler" placeholder="Optional" value={newTravelerName}
        onChange={e => setNewTravelerName(e.currentTarget.value)} />

      <Group mt="sm" justify="flex-end">
        <Button variant="default" size="xs" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={save} loading={saving}>Save room</Button>
      </Group>
    </Paper>
  );
}
