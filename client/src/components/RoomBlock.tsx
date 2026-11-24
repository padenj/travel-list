import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Paper, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { RoomForm } from './RoomForm';
import { BookingTransactionList } from './BookingTransactionList';
import { amenitiesLabel, cancelDeadlineState, cancelLabel, couponsLabel, roomMoneyLine, roomTitle } from '../utils/lodging';
import { nightsBetween } from '../utils/tripDates';

interface RoomBlockProps {
  tripId: string;
  stay: TripElement;
  booking: Booking;
  bookings: Booking[];
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  refreshKey: number;
  onChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
  actionsDisabled?: boolean;
}

const DEADLINE_COLOR = { ok: 'green', soon: 'orange', passed: 'dimmed', none: 'dimmed' } as const;

export function RoomBlock({
  tripId, stay, booking, bookings, participants, onParticipantsChanged, refreshKey, onChanged, onEditingChange, actionsDisabled,
}: RoomBlockProps) {
  const [editing, setEditing] = useState(false);
  const [transactionFormOpen, setTransactionFormOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [transactionCount, setTransactionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  const anyEditing = editing || transactionFormOpen;
  useEffect(() => {
    onEditingChangeRef.current(anyEditing);
  }, [anyEditing]);
  useEffect(() => () => onEditingChangeRef.current(false), []);

  const remove = async () => {
    try {
      setDeleting(true);
      setError(null);
      await tripApi.deleteBooking(tripId, booking.id);
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
        stayId={stay.id}
        participants={participants}
        bookings={bookings}
        booking={booking}
        onParticipantsChanged={onParticipantsChanged}
        onSaved={async () => {
          setEditing(false);
          await onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const conf = booking.currentConfirmationNumber;
  const room = booking.room ?? null;
  const travelerNames = booking.travelerIds.map(id => participants.find(p => p.id === id)?.displayName ?? 'Unknown traveler');
  const refs = [
    [booking.bookingSite, booking.siteItineraryNumber].filter(Boolean).join(' '),
    conf ? `Hotel ${conf}` : '',
    booking.confirmationNumber && booking.confirmationNumber !== conf ? `orig ${booking.confirmationNumber}` : '',
  ].filter(Boolean).join(' · ');
  const nights = nightsBetween(stay.hotelDetails?.checkInDate, stay.hotelDetails?.checkOutDate);
  const cancel = cancelLabel(room);
  const deadline = cancelDeadlineState(room?.cancelBy ?? null);
  const amenities = amenitiesLabel(room?.amenities, room?.otherAmenities);
  const coupons = couponsLabel(booking.coupons);
  const deletePrompt = `Delete ${conf ? `room ${conf}` : 'this room'}${
    transactionCount > 0 ? ` and its ${transactionCount} transaction${transactionCount === 1 ? '' : 's'}` : ''
  }?`;

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
          <Text size="sm">{deletePrompt}</Text>
          <Button size="compact-xs" color="red" onClick={remove} loading={deleting}>Confirm</Button>
          <Button size="compact-xs" variant="default" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
        </Group>
      )}

      {refs && <Text size="sm">{refs}</Text>}
      <Text size="sm" c="dimmed">{roomMoneyLine(booking, nights)}</Text>
      {cancel && (
        <Text size="sm" c={DEADLINE_COLOR[deadline]} td={deadline === 'passed' ? 'line-through' : undefined}>{cancel}</Text>
      )}
      {room?.cancellationPolicy && <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{room.cancellationPolicy}</Text>}
      {room?.roomDescription && <Text size="sm">{room.roomDescription}</Text>}
      {amenities && <Text size="sm">{amenities}</Text>}
      {coupons && <Text size="sm">{coupons}</Text>}
      {booking.notes && <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{booking.notes}</Text>}

      <BookingTransactionList
        tripId={tripId}
        bookingId={booking.id}
        originalConfirmationNumber={booking.confirmationNumber}
        refreshKey={refreshKey}
        onChanged={onChanged}
        onCountChange={setTransactionCount}
        onEditingChange={setTransactionFormOpen}
      />
    </Paper>
  );
}
