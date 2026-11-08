import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { BookingBlock } from './BookingBlock';
import { BookingForm } from './BookingForm';
import { unbookedTravelers } from '../utils/bookingCoverage';

interface BookingCardProps {
  tripId: string;
  elementId: string;
  elements: TripElement[];
  participants: TripParticipant[];
  bookings: Booking[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  refreshKey?: number;
  onBookingsChanged: () => Promise<void> | void;
  onEditingChange?: (editing: boolean) => void;
}

// Bookings tab for one flight. `bookings` is the whole trip's list (needed for conflict hints).
export function BookingCard({
  tripId, elementId, elements, participants, bookings, onParticipantsChanged, refreshKey = 0, onBookingsChanged, onEditingChange,
}: BookingCardProps) {
  const [creating, setCreating] = useState(false);
  const [editingIds, setEditingIds] = useState<string[]>([]);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  const anyEditing = creating || editingIds.length > 0;
  useEffect(() => {
    onEditingChangeRef.current?.(anyEditing);
  }, [anyEditing]);
  useEffect(() => () => onEditingChangeRef.current?.(false), []);

  const setBlockEditing = useCallback((bookingId: string, editing: boolean) => {
    setEditingIds(prev => {
      if (editing) return prev.includes(bookingId) ? prev : [...prev, bookingId];
      return prev.filter(id => id !== bookingId);
    });
  }, []);

  const mine = bookings.filter(b => b.elementIds.includes(elementId));
  const unbooked = unbookedTravelers(bookings, elementId, participants);

  return (
    <div>
      <Group justify="flex-end">
        {!creating && (
          <Button size="compact-sm" variant="light" onClick={() => setCreating(true)}>+ Booking</Button>
        )}
      </Group>
      {unbooked.length > 0 && (
        <Text size="xs" c="dimmed" ta="right" mt={4}>
          {`Not booked: ${unbooked.map(p => p.displayName).join(', ')}`}
        </Text>
      )}

      {creating && (
        <BookingForm
          tripId={tripId}
          elements={elements}
          participants={participants}
          bookings={bookings}
          defaultElementId={elementId}
          onParticipantsChanged={onParticipantsChanged}
          onSaved={async () => {
            setCreating(false);
            await onBookingsChanged();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {mine.length === 0 && !creating && (
        <Text size="sm" c="dimmed" mt="xs">No bookings yet for this flight</Text>
      )}

      {mine.map(booking => (
        <BookingBlock
          key={booking.id}
          tripId={tripId}
          booking={booking}
          bookings={bookings}
          elements={elements}
          participants={participants}
          onParticipantsChanged={onParticipantsChanged}
          refreshKey={refreshKey}
          onChanged={onBookingsChanged}
          onEditingChange={editing => setBlockEditing(booking.id, editing)}
        />
      ))}
    </div>
  );
}
