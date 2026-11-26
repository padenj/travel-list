import { useEffect, useRef, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { TripElement, TripParticipant } from '../types/trip';
import { RoomBlock } from './RoomBlock';
import { RoomForm } from './RoomForm';

interface LodgingRoomsTabProps {
  tripId: string;
  stay: TripElement;
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  onRoomsChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  initialFormOpen?: boolean;
}

function toggled(prev: Set<string>, key: string, on: boolean): Set<string> {
  if (prev.has(key) === on) return prev;
  const next = new Set(prev);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

export function LodgingRoomsTab({
  tripId, stay, participants, onParticipantsChanged, onRoomsChanged, onEditingChange, onDirtyChange, initialFormOpen = false,
}: LodgingRoomsTabProps) {
  const [adding, setAdding] = useState(initialFormOpen);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const anyEditing = adding || editingIds.size > 0;
  const anyDirty = dirtyKeys.size > 0;
  useEffect(() => {
    onEditingChangeRef.current(anyEditing);
  }, [anyEditing]);
  useEffect(() => {
    onDirtyChangeRef.current(anyDirty);
  }, [anyDirty]);
  useEffect(() => () => {
    onEditingChangeRef.current(false);
    onDirtyChangeRef.current(false);
  }, []);

  const rooms = stay.rooms ?? [];
  const takenBy = (exceptRoomId: string | null) =>
    new Set(rooms.filter(r => r.id !== exceptRoomId).flatMap(r => r.travelerIds));
  const inRoom = takenBy(null);
  const notInRoom = inRoom.size > 0 ? participants.filter(p => !inRoom.has(p.id)) : [];

  const setDirty = (key: string, dirty: boolean) => setDirtyKeys(prev => toggled(prev, key, dirty));

  return (
    <div>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{rooms.length === 0 ? 'No rooms yet for this stay' : `${rooms.length} room${rooms.length === 1 ? '' : 's'}`}</Text>
        {!adding && <Button size="xs" variant="light" onClick={() => setAdding(true)}>+ Room</Button>}
      </Group>

      {adding && (
        <RoomForm
          tripId={tripId}
          stayId={stay.id}
          takenTravelerIds={inRoom}
          participants={participants}
          onParticipantsChanged={onParticipantsChanged}
          onSaved={async () => {
            setAdding(false);
            await onRoomsChanged();
          }}
          onCancel={() => setAdding(false)}
          onDirtyChange={dirty => setDirty('new', dirty)}
        />
      )}

      {rooms.map(room => (
        <RoomBlock
          key={room.id}
          tripId={tripId}
          room={room}
          participants={participants}
          onParticipantsChanged={onParticipantsChanged}
          takenTravelerIds={takenBy(room.id)}
          onChanged={onRoomsChanged}
          onEditingChange={editing => setEditingIds(prev => toggled(prev, room.id, editing))}
          onDirtyChange={dirty => setDirty(room.id, dirty)}
          actionsDisabled={adding}
        />
      ))}

      {notInRoom.length > 0 && (
        <Text size="sm" c="dimmed" mt="xs">{`Not in a room: ${notInRoom.map(p => p.displayName).join(', ')}`}</Text>
      )}
    </div>
  );
}
