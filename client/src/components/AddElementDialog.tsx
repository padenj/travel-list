import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { tripApi } from '../api/tripApi';
import { FlightLegsEditor } from './FlightLegsEditor';
import { FlightLegDraft, buildFlightName, draftHasDate, draftToPayload, emptyLegDraft } from '../utils/flightLegs';

interface AddElementDialogProps {
  tripId: string;
  opened: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

export function AddElementDialog({ tripId, opened, onClose, onCreated }: AddElementDialogProps) {
  const isMobile = Boolean(useMediaQuery('(max-width: 48em)'));
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [legs, setLegs] = useState<FlightLegDraft[]>([emptyLegDraft()]);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nameManuallyEdited) return;
    const generated = buildFlightName(legs);
    if (generated) setName(generated);
  }, [legs, nameManuallyEdited]);

  const reset = () => {
    setName('');
    setNotes('');
    setLegs([emptyLegDraft()]);
    setNameManuallyEdited(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
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
      await tripApi.createElement(tripId, {
        elementType: 'flight',
        name: name.trim(),
        notes: notes.trim() || undefined,
        typeSpecificData: {
          legs: legs.map((draft, index) => ({ ...draftToPayload(draft), legOrder: index + 1 })),
        },
      });
      reset();
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add element');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Add flight" size="lg" fullScreen={isMobile}>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <div className="create-element-field">
        <label htmlFor="element-name">Name</label>
        <input
          id="element-name"
          type="text"
          value={name}
          onChange={e => {
            setName(e.target.value);
            setNameManuallyEdited(true);
          }}
          placeholder="e.g. Southwest Flight 1234"
        />
      </div>
      <div className="create-element-field">
        <label htmlFor="element-notes">Notes</label>
        <input id="element-notes" type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <FlightLegsEditor tripId={tripId} legs={legs} onChange={setLegs} idPrefix="new-leg" />
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
