import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { BookingForm } from './BookingForm';
import { BookingTransactionList } from './BookingTransactionList';
import { bookingMoneyLine } from '../utils/bookingSummary';
import { flightDateLabel, sortFlightsByDate } from '../utils/bookingCoverage';
import { formatLegLine } from '../utils/flightLegs';

interface BookingBlockProps {
  tripId: string;
  booking: Booking;
  bookings: Booking[];
  elements: TripElement[];
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  refreshKey: number;
  onChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
}

export function BookingBlock({
  tripId, booking, bookings, elements, participants, onParticipantsChanged, refreshKey, onChanged, onEditingChange,
}: BookingBlockProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [transactionCount, setTransactionCount] = useState(0);
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
      await tripApi.deleteBooking(tripId, booking.id);
      await onChanged();
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : 'Failed to delete booking');
    } finally {
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <BookingForm
        tripId={tripId}
        elements={elements}
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
  const covered = sortFlightsByDate(elements.filter(e => booking.elementIds.includes(e.id)));
  const travelerNames = booking.travelerIds.map(id => participants.find(p => p.id === id)?.displayName ?? 'Unknown traveler');
  const deletePrompt = `Delete ${conf ? `booking ${conf}` : 'this booking'}${
    transactionCount > 0 ? ` and its ${transactionCount} transaction${transactionCount === 1 ? '' : 's'}` : ''
  }?`;

  return (
    <Paper withBorder p="xs" mt="xs">
      {error && <Alert color="red" mb="xs">{error}</Alert>}
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Group gap="xs">
          <Text fw={700}>{conf || 'No confirmation number'}</Text>
          {booking.confirmationNumber && booking.confirmationNumber !== conf && (
            <Text size="xs" c="dimmed">{`orig ${booking.confirmationNumber}`}</Text>
          )}
          {travelerNames.map((name, index) => (
            <Badge key={`${name}-${index}`} variant="outline" tt="none" size="sm">{name}</Badge>
          ))}
        </Group>
        <Group gap={2} wrap="nowrap">
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label="Edit booking"
            onClick={() => {
              setConfirmingDelete(false);
              setError(null);
              setEditing(true);
            }}
          >
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" size="lg" aria-label="Delete booking" onClick={() => setConfirmingDelete(true)}>
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

      <Text size="sm" c="dimmed">{bookingMoneyLine(booking)}</Text>

      {covered.length > 0 && (
        <>
          <Text size="xs" c="dimmed" mt={2}>
            {`Covers: ${covered.map(f => (flightDateLabel(f) ? `${f.name} (${flightDateLabel(f)})` : f.name)).join(' · ')}`}
          </Text>
          <Stack gap={0} pl="sm" mt={2}>
            {covered.flatMap(f => f.legs ?? []).map(leg => (
              <Text key={leg.id} size="xs">{formatLegLine(leg)}</Text>
            ))}
          </Stack>
        </>
      )}

      <BookingTransactionList
        tripId={tripId}
        bookingId={booking.id}
        originalConfirmationNumber={booking.confirmationNumber}
        refreshKey={refreshKey}
        onChanged={onChanged}
        onCountChange={setTransactionCount}
      />
    </Paper>
  );
}
