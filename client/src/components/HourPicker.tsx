import { Chip, Group, Select, Text } from '@mantine/core';
import { HOUR_OPTIONS, hourLabel } from '../utils/lodging';

interface HourPickerProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  quick: string[];
}

export function HourPicker({ label, value, onChange, quick }: HourPickerProps) {
  const isQuick = value != null && quick.includes(value);
  const options = value && !HOUR_OPTIONS.some(o => o.value === value)
    ? [...HOUR_OPTIONS, { value, label: hourLabel(value) }]
    : HOUR_OPTIONS;

  return (
    <div role="group" aria-label={label}>
      <Text size="sm" fw={500} mb={4}>{label}</Text>
      <Group gap={6} wrap="wrap">
        {quick.map(hour => (
          <Chip key={hour} size="xs" checked={value === hour} onChange={() => onChange(value === hour ? null : hour)}>
            {hourLabel(hour)}
          </Chip>
        ))}
        <Select
          aria-label={`${label} other`}
          placeholder="Other"
          size="xs"
          w={110}
          clearable
          data={options}
          value={isQuick ? null : value}
          onChange={next => onChange(next)}
        />
      </Group>
    </div>
  );
}
