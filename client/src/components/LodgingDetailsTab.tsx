import { ReactNode, useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { Booking, TripDestination, TripElement } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { LodgingStayForm } from './LodgingStayForm';
import { StayDraft, isStayDraftDirty, stayDraftFromElement, stayPayload, validateStayDraft } from '../utils/stayDraft';
import { amenitiesLabel, cancelDeadlineState, cancelLabel, couponsLabel, formatTime } from '../utils/lodging';
import { formatPrice } from '../utils/flightRows';
import { duesLine } from '../utils/priceEntry';
import { formatNights, nightsBetween } from '../utils/tripDates';

interface LodgingDetailsTabProps {
  tripId: string;
  element: TripElement;
  booking: Booking | null;
  destinations: TripDestination[];
  onChanged: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}

const DEADLINE_COLOR = { ok: 'green', soon: 'orange', passed: 'dimmed', none: undefined } as const;

function dayLabel(ymd: string | null | undefined, time: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const t = formatTime(time);
  return t ? `${date}, ${t}` : date;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">{title}</Text>
      {children}
    </div>
  );
}

function bookingLine(b: Booking): string {
  const conf = b.currentConfirmationNumber ?? b.confirmationNumber;
  return [
    [b.bookingSite, b.siteItineraryNumber].filter(Boolean).join(' '),
    conf ? `Hotel ${conf}` : '',
    b.confirmationNumber && b.confirmationNumber !== conf ? `orig ${b.confirmationNumber}` : '',
  ].filter(Boolean).join(' · ');
}

function priceLine(b: Booking): string {
  const nightly = formatPrice(b.advertisedRateCash, b.advertisedRatePoints);
  const total = formatPrice(b.advertisedPriceCash, b.advertisedPricePoints);
  const parts = [
    nightly ? `${nightly}/nt` : '',
    total ? `${total} total${b.advertisedIncludesTaxes ? ' incl. taxes' : ''}` : '',
  ].filter(Boolean);
  return parts.length ? `Adv ${parts.join(' · ')}` : '';
}

export function LodgingDetailsTab({
  tripId, element, booking, destinations, onChanged, onDeleted, onEditingChange, onDirtyChange,
}: LodgingDetailsTabProps) {
  const [draft, setDraft] = useState<StayDraft | null>(null);
  const [initialDraft, setInitialDraft] = useState<StayDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const editing = draft !== null;
  const dirty = Boolean(draft && initialDraft && isStayDraftDirty(initialDraft, draft));
  useEffect(() => {
    onEditingChangeRef.current(editing);
  }, [editing]);
  useEffect(() => {
    onDirtyChangeRef.current(dirty);
  }, [dirty]);
  useEffect(() => () => {
    onEditingChangeRef.current(false);
    onDirtyChangeRef.current(false);
  }, []);

  const h = element.hotelDetails;

  const startEdit = () => {
    const start = stayDraftFromElement(element, booking);
    setConfirmingDelete(false);
    setError(null);
    setInitialDraft(start);
    setDraft(start);
  };

  const stopEdit = () => {
    setDraft(null);
    setInitialDraft(null);
    setError(null);
  };

  const save = async () => {
    if (!draft) return;
    const problem = validateStayDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const { elementType: _type, ...payload } = stayPayload(draft);
      await tripApi.updateElement(tripId, element.id, payload);
      stopEdit();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stay');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      setDeleting(true);
      setError(null);
      await tripApi.deleteElement(tripId, element.id);
      await onDeleted();
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : 'Failed to delete stay');
    } finally {
      setDeleting(false);
    }
  };

  if (draft) {
    return (
      <Stack gap={0}>
        {error && <Alert color="red" mb="xs">{error}</Alert>}
        <LodgingStayForm draft={draft} onChange={setDraft} destinations={destinations} />
        <Group mt="sm" justify="flex-end">
          <Button variant="default" size="xs" onClick={stopEdit}>Cancel</Button>
          <Button size="xs" onClick={save} loading={saving}>Save</Button>
        </Group>
      </Stack>
    );
  }

  const nights = nightsBetween(h?.checkInDate, h?.checkOutDate);
  const range = [dayLabel(h?.checkInDate, h?.checkInTime), dayLabel(h?.checkOutDate, h?.checkOutTime)].filter(Boolean).join(' → ');
  const destinationName = h?.destinationName ?? destinations.find(d => d.id === h?.destinationId)?.name ?? null;
  const refs = booking ? bookingLine(booking) : '';
  const price = booking ? priceLine(booking) : '';
  const payment = booking ? duesLine(booking, { withTotal: true }) : '';
  const cancel = cancelLabel(booking);
  const deadline = cancelDeadlineState(booking?.cancelBy ?? null);
  const amenities = amenitiesLabel(h?.amenities, h?.otherAmenities);
  const coupons = couponsLabel(booking?.coupons);

  return (
    <Stack gap="sm">
      {error && <Alert color="red">{error}</Alert>}
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text fw={600}>{range}{nights ? ` · ${formatNights(nights)}` : ''}</Text>
        <Group gap={2} wrap="nowrap">
          <ActionIcon variant="subtle" size="lg" aria-label="Edit stay" onClick={startEdit}>
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" size="lg" aria-label="Delete stay" onClick={() => setConfirmingDelete(true)}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>

      {confirmingDelete && (
        <Group gap="xs">
          <Text size="sm">Delete this stay?</Text>
          <Button size="compact-xs" color="red" onClick={remove} loading={deleting}>Confirm</Button>
          <Button size="compact-xs" variant="default" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
        </Group>
      )}

      <Stack gap={4}>
        {h?.address && (
          <div>
            <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{h.address}</Text>
            <Anchor size="sm" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.address)}`} target="_blank" rel="noopener noreferrer">
              Open in Maps
            </Anchor>
          </div>
        )}
        {h?.phone && <Anchor size="sm" href={`tel:${h.phone}`}>{h.phone}</Anchor>}
        {h?.website && (
          <Anchor size="sm" href={h.website} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>{h.website}</Anchor>
        )}
        {destinationName && <Text size="sm"><Text span c="dimmed">Destination: </Text>{destinationName}</Text>}
      </Stack>

      {(refs || booking?.loyaltyProgram) && (
        <Section title="Booking">
          {refs && <Text size="sm">{refs}</Text>}
          {booking?.loyaltyProgram && <Text size="sm">{`Loyalty: ${booking.loyaltyProgram}`}</Text>}
        </Section>
      )}
      {price && <Section title="Price"><Text size="sm">{price}</Text></Section>}
      {payment && <Section title="What you'll pay"><Text size="sm">{payment}</Text></Section>}
      {(cancel || booking?.cancellationPolicy) && (
        <Section title="Cancellation">
          {cancel && (
            <Text size="sm" c={DEADLINE_COLOR[deadline]} td={deadline === 'passed' ? 'line-through' : undefined}>{cancel}</Text>
          )}
          {booking?.cancellationPolicy && <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{booking.cancellationPolicy}</Text>}
        </Section>
      )}
      {amenities && <Section title="Property amenities"><Text size="sm">{amenities}</Text></Section>}
      {coupons && <Text size="sm">{coupons}</Text>}
      {element.notes && <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{element.notes}</Text>}
    </Stack>
  );
}
