import { useState } from 'react';
import { Alert, Button, Group, Modal } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { tripApi } from '../api/tripApi';
import { TripDestination, TripElement } from '../types/trip';
import { LodgingStayForm } from './LodgingStayForm';
import { emptyStayDraft, isStayDraftDirty, stayPayload, validateStayDraft } from '../utils/stayDraft';
import { DiscardChangesModal } from './DiscardChangesModal';

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
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const reset = () => {
    setDraft(emptyStayDraft());
    setError(null);
  };

  const closeNow = () => {
    reset();
    setConfirmingDiscard(false);
    onClose();
  };

  const handleClose = () => {
    if (isStayDraftDirty(emptyStayDraft(), draft)) setConfirmingDiscard(true);
    else closeNow();
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
    <>
      <Modal opened={opened} onClose={handleClose} title="Add lodging" size="lg" fullScreen={isMobile}>
        {error && <Alert color="red" mb="sm">{error}</Alert>}
        <LodgingStayForm draft={draft} onChange={setDraft} destinations={destinations} />
        <Group mt="md" justify="flex-end">
          <Button variant="default" onClick={handleClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save stay</Button>
        </Group>
      </Modal>
      <DiscardChangesModal opened={confirmingDiscard} onKeepEditing={() => setConfirmingDiscard(false)} onDiscard={closeNow} />
    </>
  );
}
