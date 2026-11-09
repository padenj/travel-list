import { useState } from 'react';
import { Alert, Button, Group, Modal, Text, Textarea } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { tripApi } from '../api/tripApi';
import { FlightLegsEditor } from './FlightLegsEditor';
import { FlightLegDraft, draftToPayload, emptyLegDraft, validateDraft } from '../utils/flightLegs';

interface AddElementDialogProps {
  tripId: string;
  opened: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

export function AddElementDialog({ tripId, opened, onClose, onCreated }: AddElementDialogProps) {
  const isMobile = Boolean(useMediaQuery('(max-width: 48em)'));
  const [notes, setNotes] = useState('');
  const [legs, setLegs] = useState<FlightLegDraft[]>([emptyLegDraft()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setNotes('');
    setLegs([emptyLegDraft()]);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const save = async () => {
    for (const [index, leg] of legs.entries()) {
      const problem = validateDraft(leg);
      if (problem) {
        setError(legs.length > 1 ? `Leg ${index + 1}: ${problem}` : problem);
        return;
      }
    }
    try {
      setSaving(true);
      setError(null);
      // The server names the flight from its legs ("DEN → MCO").
      await tripApi.createElement(tripId, {
        elementType: 'flight',
        notes: notes.trim() || undefined,
        typeSpecificData: {
          legs: legs.map((draft, index) => ({ ...draftToPayload(draft), legOrder: index + 1 })),
        },
      });
      reset();
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add flight');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Add flight" size="lg" fullScreen={isMobile}>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <FlightLegsEditor tripId={tripId} legs={legs} onChange={setLegs} idPrefix="new-leg" />
      <Textarea mt="sm" label="Notes" autosize minRows={1} placeholder="Optional" value={notes} onChange={e => setNotes(e.currentTarget.value)} />
      <Text size="sm" c="dimmed" mt="xs">
        Confirmation number, pricing, and travelers are entered per booking after saving this flight.
      </Text>
      <Group mt="md" justify="flex-end">
        <Button variant="default" onClick={handleClose}>Cancel</Button>
        <Button onClick={save} loading={saving}>Save flight</Button>
      </Group>
    </Modal>
  );
}
