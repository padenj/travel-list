import { useEffect, useState } from 'react';
import { Alert, Button, Group, Text, Textarea, UnstyledButton } from '@mantine/core';
import { TripElement } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { FlightLegList } from './FlightLegList';

interface FlightDetailsTabProps {
  tripId: string;
  element: TripElement;
  onChanged: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
}

export function FlightDetailsTab({ tripId, element, onChanged, onDeleted, onEditingChange }: FlightDetailsTabProps) {
  const [legsEditing, setLegsEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Swipe between tabs must stay off while a form is open; also reset when this tab unmounts.
  const editing = legsEditing || notesDraft !== null;
  useEffect(() => {
    onEditingChange(editing);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onEditingChange(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNotes = async () => {
    if (notesDraft === null) return;
    try {
      setSavingNotes(true);
      setError(null);
      await tripApi.updateElement(tripId, element.id, { notes: notesDraft.trim() || null });
      setNotesDraft(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const remove = async () => {
    try {
      setError(null);
      await tripApi.deleteElement(tripId, element.id);
      await onDeleted();
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : 'Failed to delete flight');
    }
  };

  return (
    <div>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <FlightLegList
        tripId={tripId}
        elementId={element.id}
        legs={element.legs ?? []}
        onChanged={onChanged}
        onEditingChange={setLegsEditing}
      />

      <Text size="sm" fw={600} mt="md">Notes</Text>
      {notesDraft === null ? (
        <UnstyledButton aria-label="Edit notes" onClick={() => setNotesDraft(element.notes ?? '')} w="100%" py={4}>
          <Text size="sm" c={element.notes ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>
            {element.notes || 'Add notes'}
          </Text>
        </UnstyledButton>
      ) : (
        <div>
          <Textarea
            aria-label="Notes"
            autosize
            minRows={2}
            value={notesDraft}
            onChange={e => setNotesDraft(e.currentTarget.value)}
            data-autofocus
          />
          <Group mt="xs" justify="flex-end">
            <Button variant="default" size="xs" onClick={() => setNotesDraft(null)}>Cancel</Button>
            <Button size="xs" onClick={saveNotes} loading={savingNotes}>Save notes</Button>
          </Group>
        </div>
      )}

      <Group mt="lg">
        {confirmingDelete ? (
          <>
            <Text size="sm">Delete this flight?</Text>
            <Button color="red" size="xs" onClick={remove}>Confirm</Button>
            <Button variant="default" size="xs" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          </>
        ) : (
          <Button variant="subtle" color="red" size="xs" onClick={() => setConfirmingDelete(true)} disabled={editing}>
            Delete flight
          </Button>
        )}
      </Group>
    </div>
  );
}
