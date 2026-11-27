import { useId } from 'react';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { PayAt } from '../types/trip';
import { OTHER_AMOUNT_LABEL, PriceEntryValue, duesLine, toDues, validatePriceEntry } from '../utils/priceEntry';

interface PriceEntryProps {
  value: PriceEntryValue;
  onChange: (value: PriceEntryValue) => void;
}

const PAY_AT_OPTIONS = [
  { label: 'Booking', value: 'booking' },
  { label: 'Check-in', value: 'checkin' },
];

// "What you'll pay": the total (after coupons), when most of it is paid, and the amount paid at the other time.
export function PriceEntry({ value, onChange }: PriceEntryProps) {
  const uid = useId();
  const set = <K extends keyof PriceEntryValue>(key: K, next: PriceEntryValue[K]) => onChange({ ...value, [key]: next });
  const problem = validatePriceEntry(value);
  const preview = problem ? '' : duesLine(toDues(value));

  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>What you'll pay</Text>
      <Group grow gap="xs" align="flex-start">
        <TextInput id={`${uid}-total-cash`} label="Total price (cash)" description="After coupons, incl. taxes" type="number" step="0.01"
          value={value.totalCash} onChange={e => set('totalCash', e.currentTarget.value)} />
        <TextInput id={`${uid}-total-points`} label="Total price (points)" description="Always paid at booking" type="number" step="1"
          value={value.totalPoints} onChange={e => set('totalPoints', e.currentTarget.value)} />
      </Group>
      <div>
        <Text size="sm" fw={500} mb={2} id={`${uid}-pay-at`}>Pay at</Text>
        <SegmentedControl fullWidth size="xs" aria-labelledby={`${uid}-pay-at`} data={PAY_AT_OPTIONS}
          value={value.payAt} onChange={next => set('payAt', next as PayAt)} />
      </div>
      <Group grow gap="xs" align="flex-start">
        <TextInput id={`${uid}-other`} label={OTHER_AMOUNT_LABEL[value.payAt]} type="number" step="0.01"
          value={value.otherCash} onChange={e => set('otherCash', e.currentTarget.value)} />
        <TextInput id={`${uid}-notes`} label="Check-in note" placeholder="e.g. Resort fee, bags"
          value={value.notes} onChange={e => set('notes', e.currentTarget.value)} />
      </Group>
      {problem
        ? <Text size="xs" c="red">{problem}</Text>
        : preview && <Text size="xs" c="dimmed">{preview}</Text>}
    </Stack>
  );
}
