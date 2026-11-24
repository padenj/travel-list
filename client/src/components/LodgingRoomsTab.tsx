import { useEffect, useRef, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { RoomBlock } from './RoomBlock';
import { RoomForm } from './RoomForm';

interface LodgingRoomsTabProps {
  tripId: string;
  stay: TripElement;
  participants: TripParticipant[];
  bookings: Booking[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  refreshKey: number;
  onBookingsChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
  initialFormOpen?: boolean;
}

export function LodgingRoomsTab({
  tripId, stay, participants, bookings, onParticipantsChanged, refreshKey, onBookingsChanged, onEditingChange, initialFormOpen = false,
}: LodgingRoomsTabProps) {
  const [adding, setAdding] = useState(initialFormOpen);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  const anyEditing = adding || editingIds.size > 0;
  useEffect(() => {
    onEditingChangeRef.current(anyEditing);
  }, [anyEditing]);
  useEffect(() => () => onEditingChangeRef.current(false), []);

  const rooms = bookings.filter(b => b.elementIds.length === 1 && b.elementIds[0] === stay.id);
  const inRoom = new Set(rooms.flatMap(r => r.travelerIds));
  const notInRoom = inRoom.size > 0 ? participants.filter(p => !inRoom.has(p.id)) : [];

  const setBlockEditing = (id: string, editing: boolean) =>
    setEditingIds(prev => {
      const next = new Set(prev);
      if (editing) next.add(id);
      else next.delete(id);
      return next.size === prev.size && [...next].every(x => prev.has(x)) ? prev : next;
    });

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
          participants={participants}
          bookings={bookings}
          onParticipantsChanged={onParticipantsChanged}
          onSaved={async () => {
            setAdding(false);
            await onBookingsChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {rooms.map(room => (
        <RoomBlock
          key={room.id}
          tripId={tripId}
          stay={stay}
          booking={room}
          bookings={bookings}
          participants={participants}
          onParticipantsChanged={onParticipantsChanged}
          refreshKey={refreshKey}
          onChanged={onBookingsChanged}
          onEditingChange={editing => setBlockEditing(room.id, editing)}
          actionsDisabled={adding}
        />
      ))}

      {notInRoom.length > 0 && (
        <Text size="sm" c="dimmed" mt="xs">{`Not in a room: ${notInRoom.map(p => p.displayName).join(', ')}`}</Text>
      )}
    </div>
  );
}
