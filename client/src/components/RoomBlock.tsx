import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Paper, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { LodgingRoom, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { RoomForm } from './RoomForm';
import { amenitiesLabel, roomTitle } from '../utils/lodging';

interface RoomBlockProps {
  tripId: string;
  room: LodgingRoom;
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  takenTravelerIds: Set<string>;
  onChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  actionsDisabled?: boolean;
}

export function RoomBlock({
  tripId, room, participants, onParticipantsChanged, takenTravelerIds, onChanged, onEditingChange, onDirtyChange, actionsDisabled,
}: RoomBlockProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  useEffect(() => {
    onEditingChangeRef.current(editing);
  }, [editing]);
  useEffect(() => () => onEditingChangeRef.current(false), []);

  const remove = async () => {
    try {
      setDeleting(true);
      setError(null);
      await tripApi.deleteRoom(tripId, room.id);
      await onChanged();
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : 'Failed to delete room');
    } finally {
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <RoomForm
        tripId={tripId}
        stayId={room.elementId}
        room={room}
        takenTravelerIds={takenTravelerIds}
        participants={participants}
        onParticipantsChanged={onParticipantsChanged}
        onSaved={async () => {
          setEditing(false);
          await onChanged();
        }}
        onCancel={() => setEditing(false)}
        onDirtyChange={onDirtyChange}
      />
    );
  }

  const travelerNames = room.travelerIds.map(id => participants.find(p => p.id === id)?.displayName ?? 'Unknown traveler');
  const amenities = amenitiesLabel(room.amenities, room.otherAmenities);

  return (
    <Paper withBorder p="xs" mt="xs">
      {error && <Alert color="red" mb="xs">{error}</Alert>}
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Group gap="xs">
          <Text fw={700}>{roomTitle(room)}</Text>
          {travelerNames.map((name, index) => (
            <Badge key={`${name}-${index}`} variant="outline" tt="none" size="sm">{name}</Badge>
          ))}
        </Group>
        <Group gap={2} wrap="nowrap">
          <ActionIcon variant="subtle" size="lg" aria-label="Edit room" disabled={actionsDisabled}
            onClick={() => { setConfirmingDelete(false); setError(null); setEditing(true); }}>
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" size="lg" aria-label="Delete room" disabled={actionsDisabled} onClick={() => setConfirmingDelete(true)}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>

      {confirmingDelete && (
        <Group gap="xs" mt={4}>
          <Text size="sm">Delete this room?</Text>
          <Button size="compact-xs" color="red" onClick={remove} loading={deleting}>Confirm</Button>
          <Button size="compact-xs" variant="default" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
        </Group>
      )}

      {room.description && <Text size="sm">{room.description}</Text>}
      {amenities && <Text size="sm">{amenities}</Text>}
    </Paper>
  );
}
