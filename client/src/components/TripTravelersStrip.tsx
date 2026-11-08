import { useState } from 'react';
import { Badge, Button, Group, Modal, Text } from '@mantine/core';
import { TripParticipant } from '../types/trip';
import { TripParticipantsPanel } from './TripParticipantsPanel';

const VISIBLE_CHIPS = 3;

interface TripTravelersStripProps {
  tripId: string;
  participants: TripParticipant[];
  refreshKey: number;
  onParticipantsChanged: (participants: TripParticipant[]) => void;
}

export function TripTravelersStrip({ tripId, participants, refreshKey, onParticipantsChanged }: TripTravelersStripProps) {
  const [managing, setManaging] = useState(false);
  const shown = participants.slice(0, VISIBLE_CHIPS);
  const extra = participants.length - shown.length;

  return (
    <>
      <Group gap="xs" mt="xs" wrap="wrap">
        <Text size="sm" fw={600}>Travelers</Text>
        {participants.length === 0 && <Text size="sm" c="dimmed">None yet</Text>}
        {shown.map(p => (
          <Badge key={p.id} variant="outline" tt="none">{p.displayName}</Badge>
        ))}
        {extra > 0 && <Badge variant="light" tt="none">+{extra}</Badge>}
        <Button size="compact-xs" variant="subtle" onClick={() => setManaging(true)}>Manage</Button>
      </Group>

      <Modal opened={managing} onClose={() => setManaging(false)} title="Manage travelers" size="lg">
        <TripParticipantsPanel tripId={tripId} refreshKey={refreshKey} onParticipantsChanged={onParticipantsChanged} />
      </Modal>
    </>
  );
}
