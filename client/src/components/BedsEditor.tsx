import { ActionIcon, Button, Group, NumberInput, Select, Stack } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { BedCount, BedType } from '../types/trip';
import { BED_TYPE_OPTIONS } from '../utils/lodging';

interface BedsEditorProps {
  beds: BedCount[];
  onChange: (beds: BedCount[]) => void;
}

export function BedsEditor({ beds, onChange }: BedsEditorProps) {
  const used = new Set(beds.map(b => b.type));
  const nextType = BED_TYPE_OPTIONS.find(o => !used.has(o.value))?.value;

  const update = (index: number, patch: Partial<BedCount>) =>
    onChange(beds.map((bed, i) => (i === index ? { ...bed, ...patch } : bed)));

  return (
    <Stack gap={4}>
      {beds.map((bed, index) => (
        <Group key={index} gap="xs" wrap="nowrap">
          <Select
            aria-label={`Bed type ${index + 1}`}
            data={BED_TYPE_OPTIONS.filter(o => o.value === bed.type || !used.has(o.value))}
            value={bed.type}
            allowDeselect={false}
            onChange={value => value && update(index, { type: value as BedType })}
            style={{ flex: 1 }}
          />
          <NumberInput
            aria-label={`Bed count ${index + 1}`}
            min={1}
            max={9}
            w={72}
            value={bed.count}
            onChange={value => update(index, { count: typeof value === 'number' ? value : 1 })}
          />
          <ActionIcon variant="subtle" color="gray" aria-label={`Remove bed ${index + 1}`} onClick={() => onChange(beds.filter((_, i) => i !== index))}>
            <IconX size={14} />
          </ActionIcon>
        </Group>
      ))}
      {nextType && (
        <Button variant="subtle" size="compact-sm" onClick={() => onChange([...beds, { type: nextType, count: 1 }])} style={{ alignSelf: 'flex-start' }}>
          + Bed
        </Button>
      )}
    </Stack>
  );
}
