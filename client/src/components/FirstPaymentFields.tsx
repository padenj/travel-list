import { useId } from 'react';
import { Checkbox, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { FirstPaymentDraft } from '../utils/priceEntry';
import { PaymentMethodSelect } from './PaymentMethodSelect';

interface FirstPaymentFieldsProps {
  value: FirstPaymentDraft;
  onChange: (value: FirstPaymentDraft) => void;
  amountLabel: string;
}

// Shown while creating a booking when something is due at booking.
export function FirstPaymentFields({ value, onChange, amountLabel }: FirstPaymentFieldsProps) {
  const uid = useId();
  return (
    <Paper withBorder p="xs">
      <Stack gap="xs">
        <Checkbox id={`${uid}-enabled`} label="Also record payment" checked={value.enabled}
          onChange={e => onChange({ ...value, enabled: e.currentTarget.checked })} />
        {value.enabled && (
          <>
            <Text size="xs" c="dimmed">{`Records a payment of ${amountLabel}`}</Text>
            <Group grow gap="xs" align="flex-start">
              <TextInput id={`${uid}-date`} label="Payment date" type="date" value={value.transactionDate}
                onChange={e => onChange({ ...value, transactionDate: e.currentTarget.value })} />
              <PaymentMethodSelect value={value.paymentMethodId} onChange={id => onChange({ ...value, paymentMethodId: id })} />
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
}
