import { Select } from '@mantine/core';

export interface NotesDestinationPickerProps {
  groups: { listId: string; name: string }[];
  value: string | null;
  onChange: (listId: string) => void;
}

export default function NotesDestinationPicker({ groups, value, onChange }: NotesDestinationPickerProps) {
  if (groups.length < 2) return null;
  return (
    <Select
      size="xs"
      aria-label="Notes destination"
      data={groups.map(g => ({ value: g.listId, label: g.name }))}
      value={value}
      onChange={v => v && onChange(v)}
      allowDeselect={false}
      style={{ maxWidth: 200 }}
    />
  );
}
