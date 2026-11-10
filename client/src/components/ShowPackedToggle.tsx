import { useState } from 'react';
import { Switch } from '@mantine/core';

const STORAGE_KEY = 'personViewShowPacked';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useShowPacked(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(readStored);
  const update = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore storage errors
    }
  };
  return [value, update];
}

export default function ShowPackedToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Switch
      size="sm"
      label="Show packed"
      checked={value}
      onChange={e => onChange(e.currentTarget.checked)}
    />
  );
}
