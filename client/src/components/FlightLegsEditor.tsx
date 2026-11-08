import { useRef } from 'react';
import { ActionIcon, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { FlightLegForm } from './FlightLegForm';
import { FlightLegDraft, draftLayover, emptyLegDraft, formatLayover } from '../utils/flightLegs';

interface FlightLegsEditorProps {
  tripId: string;
  legs: FlightLegDraft[];
  onChange: (legs: FlightLegDraft[]) => void;
  idPrefix?: string;
}

// Stack of leg forms used when creating a flight.
export function FlightLegsEditor({ tripId, legs, onChange, idPrefix = 'leg' }: FlightLegsEditorProps) {
  // Tracks the latest legs array so async lookups (which call update/remove well
  // after the render that created their closures) never write back a stale list.
  const legsRef = useRef(legs);
  legsRef.current = legs;

  // Stable per-leg identity, independent of list position, so FlightLegForm's
  // internal lookup state stays with the leg it belongs to when legs are removed.
  const keySeqRef = useRef(0);
  const nextKey = () => `k${++keySeqRef.current}`;
  const keysRef = useRef<string[]>(legs.map(() => nextKey()));
  if (keysRef.current.length !== legs.length) {
    keysRef.current = legs.map(() => nextKey());
  }

  const emit = (next: FlightLegDraft[]) => {
    legsRef.current = next;
    onChange(next);
  };

  const update = (key: string, draft: FlightLegDraft) => {
    const i = keysRef.current.indexOf(key);
    if (i === -1) return;
    emit(legsRef.current.map((leg, idx) => (idx === i ? draft : leg)));
  };

  const remove = (index: number) => {
    keysRef.current = keysRef.current.filter((_, i) => i !== index);
    emit(legsRef.current.filter((_, i) => i !== index));
  };

  const add = () => {
    keysRef.current = [...keysRef.current, nextKey()];
    emit([...legsRef.current, emptyLegDraft(legsRef.current[legsRef.current.length - 1])]);
  };

  return (
    <Stack gap="xs">
      {legs.map((leg, index) => {
        const layover = index > 0 ? draftLayover(legs[index - 1], leg) : null;
        const key = keysRef.current[index];
        return (
          <div key={key}>
            {layover !== null && (
              <Text size="sm" c="dimmed" ta="center" mb="xs">
                {`Layover${leg.departureAirport ? ` in ${leg.departureAirport}` : ''}: ${formatLayover(layover)}`}
              </Text>
            )}
            <Paper withBorder p="sm">
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Leg {index + 1}</Text>
                {legs.length > 1 && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={`Remove leg ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
              <FlightLegForm tripId={tripId} draft={leg} onChange={draft => update(key, draft)} idPrefix={`${idPrefix}-${key}`} />
            </Paper>
          </div>
        );
      })}
      <Button
        variant="light"
        size="compact-sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={add}
      >
        + Leg
      </Button>
    </Stack>
  );
}
