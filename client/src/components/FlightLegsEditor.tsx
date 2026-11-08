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
  const update = (index: number, draft: FlightLegDraft) =>
    onChange(legs.map((leg, i) => (i === index ? draft : leg)));

  return (
    <Stack gap="xs">
      {legs.map((leg, index) => {
        const layover = index > 0 ? draftLayover(legs[index - 1], leg) : null;
        return (
          <div key={`leg-${index}`}>
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
                    onClick={() => onChange(legs.filter((_, i) => i !== index))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
              <FlightLegForm tripId={tripId} draft={leg} onChange={draft => update(index, draft)} idPrefix={`${idPrefix}-${index}`} />
            </Paper>
          </div>
        );
      })}
      <Button
        variant="light"
        size="compact-sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...legs, emptyLegDraft(legs[legs.length - 1])])}
      >
        + Leg
      </Button>
    </Stack>
  );
}
