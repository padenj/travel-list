import { useEffect, useState } from 'react';
import { Alert, Anchor, Button, Group, Text } from '@mantine/core';
import { TripElement } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { FlightLegsEditor } from './FlightLegsEditor';
import {
  FlightLegDraft,
  draftHasDate,
  draftToPayload,
  emptyLegDraft,
  formatLayover,
  formatLegTime,
  legToDraft,
} from '../utils/flightLegs';

interface FlightDetailsTabProps {
  tripId: string;
  element: TripElement;
  onChanged: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
}

export function FlightDetailsTab({ tripId, element, onChanged, onDeleted, onEditingChange }: FlightDetailsTabProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(element.name);
  const [notes, setNotes] = useState(element.notes ?? '');
  const [legs, setLegs] = useState<FlightLegDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Swipe between tabs must stay off while a form is open; also reset when this tab unmounts.
  useEffect(() => {
    onEditingChange(editing);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onEditingChange(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const startEditing = () => {
    setName(element.name);
    setNotes(element.notes ?? '');
    setLegs(element.legs?.length ? element.legs.map(legToDraft) : [emptyLegDraft()]);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Element name is required');
      return;
    }
    if (!legs.every(draftHasDate)) {
      setError('Each flight needs a flight date or departure time');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await tripApi.updateElement(tripId, element.id, { name: name.trim(), notes: notes.trim() || undefined });
      await tripApi.syncLegs(tripId, element.id, legs.map(draftToPayload));
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save element');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      setError(null);
      await tripApi.deleteElement(tripId, element.id);
      await onDeleted();
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : 'Failed to delete element');
    }
  };

  if (editing) {
    return (
      <div>
        {error && <Alert color="red" mb="sm">{error}</Alert>}
        <div className="create-element-field">
          <label htmlFor={`edit-name-${element.id}`}>Name</label>
          <input id={`edit-name-${element.id}`} type="text" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <FlightLegsEditor tripId={tripId} legs={legs} onChange={setLegs} idPrefix={`edit-leg-${element.id}`} />
        <div className="create-element-field">
          <label htmlFor={`edit-notes-${element.id}`}>Notes</label>
          <input id={`edit-notes-${element.id}`} type="text" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <Group mt="sm">
          <Button onClick={save} loading={saving}>Save changes</Button>
          <Button variant="default" onClick={() => setEditing(false)}>Cancel</Button>
        </Group>
      </div>
    );
  }

  const legList = element.legs ?? [];
  return (
    <div>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      {legList.length === 0 && <Text c="dimmed">No legs yet — use Edit to add them.</Text>}
      {legList.map((leg, index) => (
        <div key={leg.id} style={{ marginBottom: 'var(--mantine-spacing-xs)' }}>
          <Text fw={600}>
            {leg.departureAirport || '—'} → {leg.arrivalAirport || '—'}{' '}
            <Text span c="dimmed" fw={400}>
              {[leg.airline, leg.flightNumber].filter(Boolean).join(' ')}
              {leg.departureDatetime ? ` · ${formatLegTime(leg.departureDatetime)}` : ''}
              {leg.arrivalDatetime ? ` → ${formatLegTime(leg.arrivalDatetime)}` : ''}
            </Text>
          </Text>
          {leg.checkPriceUrl && (
            <Anchor href={leg.checkPriceUrl} target="_blank" rel="noreferrer" size="sm">Check price</Anchor>
          )}
          {index < legList.length - 1 && leg.layoverMinutesAfter != null && (
            <Text size="sm" c="dimmed">Layover: {formatLayover(leg.layoverMinutesAfter)}</Text>
          )}
        </div>
      ))}
      {element.notes && <Text mt="sm">{element.notes}</Text>}

      <Group mt="md">
        <Button variant="light" onClick={startEditing}>Edit</Button>
        {confirmingDelete ? (
          <>
            <Text size="sm">Delete this flight?</Text>
            <Button color="red" size="xs" onClick={remove}>Confirm</Button>
            <Button variant="default" size="xs" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          </>
        ) : (
          <Button variant="subtle" color="red" onClick={() => setConfirmingDelete(true)}>Delete</Button>
        )}
      </Group>
    </div>
  );
}
