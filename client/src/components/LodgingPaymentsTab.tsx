import { Stack, Text } from '@mantine/core';
import { Booking } from '../types/trip';
import { BookingTransactionList } from './BookingTransactionList';
import { paymentSummary } from '../utils/lodging';
import { formatPrice } from '../utils/flightRows';

interface LodgingPaymentsTabProps {
  tripId: string;
  booking: Booking | null;
  refreshKey: number;
  onChanged: () => void;
  onCountChange: (count: number) => void;
  onEditingChange: (editing: boolean) => void;
}

export function LodgingPaymentsTab({ tripId, booking, refreshKey, onChanged, onCountChange, onEditingChange }: LodgingPaymentsTabProps) {
  if (!booking) {
    return <Text size="sm" c="dimmed">Save the stay details to start recording payments.</Text>;
  }

  const summary = paymentSummary(booking);

  return (
    <Stack gap="xs">
      {summary ? (
        <div>
          <Text size="sm" c="dimmed">
            {`Due ${formatPrice(summary.dueCash, summary.duePoints) || '$0.00'} · Paid ${formatPrice(summary.paidCash, summary.paidPoints) || '$0.00'}`}
          </Text>
          <Text fw={700}>{summary.label}</Text>
          {booking.dueLaterNotes && <Text size="sm" c="dimmed">{booking.dueLaterNotes}</Text>}
        </div>
      ) : (
        <Text size="sm" c="dimmed">Add amounts due on the Details tab to track what's remaining.</Text>
      )}
      <BookingTransactionList
        tripId={tripId}
        bookingId={booking.id}
        originalConfirmationNumber={booking.confirmationNumber}
        refreshKey={refreshKey}
        onChanged={onChanged}
        onCountChange={onCountChange}
        onEditingChange={onEditingChange}
      />
    </Stack>
  );
}
