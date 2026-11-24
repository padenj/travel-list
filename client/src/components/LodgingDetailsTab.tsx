import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { TripDestination, TripElement } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { LodgingStayForm } from './LodgingStayForm';
import { StayDraft, stayDraftFromElement, stayPayload, validateStayDraft } from '../utils/stayDraft';
import { formatTime } from '../utils/lodging';
import { formatNights, nightsBetween } from '../utils/tripDates';

interface LodgingDetailsTabProps {
  tripId: string;
  element: TripElement;
  destinations: TripDestination[];
  onChanged: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
}

function dayLabel(ymd: string | null | undefined, time: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const t = formatTime(time);
  return t ? `${date}, ${t}` : date;
}

export function LodgingDetailsTab({ tripId, element, destinations, onChanged, onDeleted, onEditingChange }: LodgingDetailsTabProps) {
  const [draft, setDraft] = useState<StayDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  const editing = draft !== null;
  useEffect(() => {
    onEditingChangeRef.current(editing);
  }, [editing]);
  useEffect(() => () => onEditingChangeRef.current(false), []);

  const h = element.hotelDetails;

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
      setDraft(null);
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
          <Button variant="default" size="xs" onClick={() => { setDraft(null); setError(null); }}>Cancel</Button>
          <Button size="xs" onClick={save} loading={saving}>Save</Button>
        </Group>
      </Stack>
    );
  }

  const nights = nightsBetween(h?.checkInDate, h?.checkOutDate);
  const range = [dayLabel(h?.checkInDate, h?.checkInTime), dayLabel(h?.checkOutDate, h?.checkOutTime)].filter(Boolean).join(' → ');
  const destinationName = h?.destinationName ?? destinations.find(d => d.id === h?.destinationId)?.name ?? null;

  return (
    <Stack gap={6}>
      {error && <Alert color="red">{error}</Alert>}
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text fw={600}>{range}{nights ? ` · ${formatNights(nights)}` : ''}</Text>
        <Group gap={2} wrap="nowrap">
          <ActionIcon variant="subtle" size="lg" aria-label="Edit stay" onClick={() => { setConfirmingDelete(false); setError(null); setDraft(stayDraftFromElement(element)); }}>
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
      {element.notes && <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{element.notes}</Text>}
    </Stack>
  );
}
