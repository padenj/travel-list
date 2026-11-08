import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Text, Textarea, UnstyledButton, VisuallyHidden } from '@mantine/core';
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
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const notesButtonRef = useRef<HTMLButtonElement>(null);

  // Swipe between tabs must stay off while a form is open; also reset when this tab unmounts.
  const editing = legsEditing || notesDraft !== null;
  useEffect(() => {
    onEditingChange(editing);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onEditingChange(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide the delete confirmation whenever another editor (legs or notes) opens.
  useEffect(() => {
    if (editing) setConfirmingDelete(false);
  }, [editing]);

  const wasEditingNotesRef = useRef(false);
  useEffect(() => {
    if (notesDraft !== null) {
      notesTextareaRef.current?.focus();
      wasEditingNotesRef.current = true;
    } else if (wasEditingNotesRef.current) {
      notesButtonRef.current?.focus();
      wasEditingNotesRef.current = false;
    }
  }, [notesDraft]);

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
      setDeleting(true);
      setError(null);
      await tripApi.deleteElement(tripId, element.id);
      await onDeleted();
    } catch (err) {
      setConfirmingDelete(false);
      setDeleting(false);
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
        <UnstyledButton ref={notesButtonRef} onClick={() => setNotesDraft(element.notes ?? '')} w="100%" py={4}>
          <Text size="sm" c={element.notes ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>
            {element.notes || 'Add notes'}
          </Text>
          <VisuallyHidden>Edit notes</VisuallyHidden>
        </UnstyledButton>
      ) : (
        <div>
          <Textarea
            ref={notesTextareaRef}
            aria-label="Notes"
            autosize
            minRows={2}
            value={notesDraft}
            onChange={e => setNotesDraft(e.currentTarget.value)}
          />
          <Group mt="xs" justify="flex-end">
            <Button variant="default" size="xs" onClick={() => setNotesDraft(null)} disabled={savingNotes}>Cancel</Button>
            <Button size="xs" onClick={saveNotes} loading={savingNotes}>Save notes</Button>
          </Group>
        </div>
      )}

      <Group mt="lg">
        {confirmingDelete ? (
          <>
            <Text size="sm">Delete this flight?</Text>
            <Button color="red" size="xs" onClick={remove} loading={deleting} disabled={deleting}>Confirm</Button>
            <Button variant="default" size="xs" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancel</Button>
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
