import { useId } from 'react';
import { Select, SimpleGrid, TextInput, Textarea } from '@mantine/core';
import { TripDestination } from '../types/trip';
import { StayDraft, addDays } from '../utils/stayDraft';

interface LodgingStayFormProps {
  draft: StayDraft;
  onChange: (draft: StayDraft) => void;
  destinations: TripDestination[];
}

export function LodgingStayForm({ draft, onChange, destinations }: LodgingStayFormProps) {
  const uid = useId();
  const set = <K extends keyof StayDraft>(key: K, value: StayDraft[K]) => onChange({ ...draft, [key]: value });

  const setCheckIn = (value: string) => {
    const next = { ...draft, checkInDate: value };
    if (value && !draft.checkOutDate) next.checkOutDate = addDays(value, 1);
    onChange(next);
  };

  return (
    <>
      <TextInput id={`${uid}-name`} label="Hotel name" value={draft.name} onChange={e => set('name', e.currentTarget.value)} />
      <Textarea id={`${uid}-address`} mt="xs" label="Address" autosize minRows={2} value={draft.address} onChange={e => set('address', e.currentTarget.value)} />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" mt="xs">
        <TextInput id={`${uid}-phone`} label="Phone" type="tel" value={draft.phone} onChange={e => set('phone', e.currentTarget.value)} />
        <TextInput id={`${uid}-website`} label="Website" type="url" value={draft.website} onChange={e => set('website', e.currentTarget.value)} />
        <TextInput id={`${uid}-in-date`} label="Check-in date" type="date" value={draft.checkInDate} onChange={e => setCheckIn(e.currentTarget.value)} />
        <TextInput id={`${uid}-in-time`} label="Check-in time" type="time" value={draft.checkInTime} onChange={e => set('checkInTime', e.currentTarget.value)} />
        <TextInput id={`${uid}-out-date`} label="Check-out date" type="date" value={draft.checkOutDate} onChange={e => set('checkOutDate', e.currentTarget.value)} />
        <TextInput id={`${uid}-out-time`} label="Check-out time" type="time" value={draft.checkOutTime} onChange={e => set('checkOutTime', e.currentTarget.value)} />
      </SimpleGrid>
      {destinations.length > 0 && (
        <Select
          id={`${uid}-destination`}
          mt="xs"
          label="Destination"
          placeholder="None"
          clearable
          data={destinations.map(d => ({ value: d.id, label: d.name }))}
          value={draft.destinationId}
          onChange={value => set('destinationId', value)}
        />
      )}
      <Textarea id={`${uid}-notes`} mt="xs" label="Notes" autosize minRows={1} value={draft.notes} onChange={e => set('notes', e.currentTarget.value)} />
    </>
  );
}
