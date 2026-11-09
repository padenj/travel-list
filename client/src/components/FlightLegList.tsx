import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Anchor, Button, Group, Paper, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { FlightLeg, FlightLegPayload } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { FlightLegForm } from './FlightLegForm';
import {
  FlightLegDraft, draftToPayload, emptyLegDraft, formatLayover, formatLegLine, legToDraft, legToPayload, validateDraft,
} from '../utils/flightLegs';

interface FlightLegListProps {
  tripId: string;
  elementId: string;
  legs: FlightLeg[];
  onChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
}

type Editing = { index: number | 'new'; draft: FlightLegDraft };

export function FlightLegList({ tripId, elementId, legs, onChanged, onEditingChange }: FlightLegListProps) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  const isEditing = editing !== null;
  useEffect(() => {
    onEditingChangeRef.current(isEditing);
  }, [isEditing]);

  const startEdit = (index: number) => {
    setConfirmingIndex(null);
    setError(null);
    setEditing({ index, draft: legToDraft(legs[index]) });
  };

  const startAdd = () => {
    setConfirmingIndex(null);
    setError(null);
    const last = legs[legs.length - 1];
    setEditing({ index: 'new', draft: emptyLegDraft(last ? legToDraft(last) : undefined) });
  };

  const cancel = () => {
    setEditing(null);
    setError(null);
  };

  // Every change sends the whole list; the server diffs by leg id.
  const persist = async (payload: FlightLegPayload[]) => {
    try {
      setSaving(true);
      setError(null);
      await tripApi.syncLegs(tripId, elementId, payload);
      setEditing(null);
      setConfirmingIndex(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save legs');
    } finally {
      setSaving(false);
    }
  };

  const saveLeg = async () => {
    if (!editing) return;
    const problem = validateDraft(editing.draft);
    if (problem) {
      setError(problem);
      return;
    }
    const edited = draftToPayload(editing.draft);
    const payload = editing.index === 'new'
      ? [...legs.map(legToPayload), edited]
      : legs.map((leg, i) => (i === editing.index ? edited : legToPayload(leg)));
    await persist(payload);
  };

  const deleteLeg = (index: number) => persist(legs.filter((_, i) => i !== index).map(legToPayload));

  const form = editing && (
    <Paper withBorder p="sm" my="xs">
      <FlightLegForm
        tripId={tripId}
        draft={editing.draft}
        onChange={draft => setEditing({ ...editing, draft })}
        idPrefix={`leg-${elementId}-${editing.index}`}
      />
      <Group mt="sm" justify="flex-end">
        <Button variant="default" size="xs" onClick={cancel} disabled={saving}>Cancel</Button>
        <Button size="xs" onClick={saveLeg} loading={saving}>Save leg</Button>
      </Group>
    </Paper>
  );

  return (
    <div>
      {error && <Alert color="red" mb="xs">{error}</Alert>}
      {legs.length === 0 && editing?.index !== 'new' && <Text size="sm" c="dimmed">No legs yet</Text>}
      {legs.map((leg, index) => (
        <div key={leg.id}>
          {editing?.index === index ? form : (
            <Group justify="space-between" wrap="nowrap" gap="xs" py={2}>
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500}>{formatLegLine(leg)}</Text>
                {leg.checkPriceUrl && (
                  <Anchor href={leg.checkPriceUrl} target="_blank" rel="noreferrer" size="xs">Check price</Anchor>
                )}
              </div>
              {confirmingIndex === index ? (
                <Group gap={4} wrap="nowrap">
                  <Text size="xs">Delete this leg?</Text>
                  <Button size="xs" color="red" onClick={() => deleteLeg(index)} loading={saving}>Confirm</Button>
                  <Button size="xs" variant="default" onClick={() => setConfirmingIndex(null)}>Cancel</Button>
                </Group>
              ) : (
                <Group gap={2} wrap="nowrap">
                  <ActionIcon variant="subtle" size="lg" aria-label={`Edit leg ${index + 1}`} onClick={() => startEdit(index)} disabled={isEditing || saving}>
                    <IconPencil size={16} />
                  </ActionIcon>
                  {legs.length > 1 && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="lg"
                      aria-label={`Delete leg ${index + 1}`}
                      onClick={() => {
                        setError(null);
                        setConfirmingIndex(index);
                      }}
                      disabled={isEditing || saving}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Group>
              )}
            </Group>
          )}
          {index < legs.length - 1 && leg.layoverMinutesAfter != null && (
            <Text size="xs" c="dimmed" pl="md">{`Layover: ${formatLayover(leg.layoverMinutesAfter)}`}</Text>
          )}
        </div>
      ))}
      {editing?.index === 'new' ? form : (
        <Button variant="light" size="compact-sm" mt="xs" onClick={startAdd} disabled={isEditing || saving}>+ Leg</Button>
      )}
    </div>
  );
}
