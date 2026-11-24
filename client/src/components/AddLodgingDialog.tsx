import { useState } from 'react';
import { Alert, Button, Group, Modal, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { tripApi } from '../api/tripApi';
import { TripDestination, TripElement } from '../types/trip';
import { LodgingStayForm } from './LodgingStayForm';
import { emptyStayDraft, stayPayload, validateStayDraft } from '../utils/stayDraft';

interface AddLodgingDialogProps {
  tripId: string;
  opened: boolean;
  destinations: TripDestination[];
  onClose: () => void;
  onCreated: (element: TripElement) => Promise<void> | void;
}

export function AddLodgingDialog({ tripId, opened, destinations, onClose, onCreated }: AddLodgingDialogProps) {
  const isMobile = Boolean(useMediaQuery('(max-width: 48em)'));
  const [draft, setDraft] = useState(emptyStayDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDraft(emptyStayDraft());
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const save = async () => {
    const problem = validateStayDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const created = await tripApi.createElement(tripId, stayPayload(draft));
      reset();
      await onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add lodging');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Add lodging" size="lg" fullScreen={isMobile}>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <LodgingStayForm draft={draft} onChange={setDraft} destinations={destinations} />
      <Text size="sm" c="dimmed" mt="xs">
        Rooms, pricing, confirmation numbers and cancellation are entered per room after saving.
      </Text>
      <Group mt="md" justify="flex-end">
        <Button variant="default" onClick={handleClose}>Cancel</Button>
        <Button onClick={save} loading={saving}>Save stay</Button>
      </Group>
    </Modal>
  );
}
