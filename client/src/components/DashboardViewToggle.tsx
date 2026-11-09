import { useState } from 'react';
import { SegmentedControl } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

export type DashboardViewMode = 'person' | 'columns';

const STORAGE_KEY = 'dashboardView';

function readStoredMode(): DashboardViewMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'person' || value === 'columns' ? value : null;
  } catch {
    return null;
  }
}

export function useDashboardViewMode(): [DashboardViewMode, (mode: DashboardViewMode) => void] {
  const isMobile = useMediaQuery('(max-width: 48em)', undefined, { getInitialValueInEffect: false });
  const [stored, setStored] = useState<DashboardViewMode | null>(readStoredMode);
  const setMode = (mode: DashboardViewMode) => {
    setStored(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  };
  return [stored ?? (isMobile ? 'person' : 'columns'), setMode];
}

export default function DashboardViewToggle({ value, onChange }: { value: DashboardViewMode; onChange: (mode: DashboardViewMode) => void }) {
  return (
    <SegmentedControl
      size="xs"
      aria-label="Dashboard view"
      value={value}
      onChange={v => onChange(v as DashboardViewMode)}
      data={[
        { label: 'Person', value: 'person' },
        { label: 'Columns', value: 'columns' },
      ]}
    />
  );
}
