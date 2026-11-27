import { useEffect, useId, useState } from 'react';
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { PaymentMethod } from '../types/trip';
import { paymentMethodApi } from '../api/paymentMethodApi';

const NEW_OPTION = '__new__';

interface PaymentMethodSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
}

// Family payment methods by nickname, with a "+ New payment method…" option that adds one inline.
export function PaymentMethodSelect({ value, onChange, label = 'Payment method' }: PaymentMethodSelectProps) {
  const uid = useId();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [adding, setAdding] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    paymentMethodApi.list(true)
      .then(list => { if (alive) setMethods(list); })
      .catch(() => { if (alive) setMethods([]); });
    return () => { alive = false; };
  }, []);

  const data = [
    ...methods
      .filter(m => !m.archived || m.id === value)
      .map(m => ({ value: m.id, label: m.archived ? `${m.nickname} (archived)` : m.nickname })),
    { value: NEW_OPTION, label: '+ New payment method…' },
  ];

  const pick = (next: string | null) => {
    if (next === NEW_OPTION) {
      setAdding(true);
      setError(null);
      return;
    }
    onChange(next);
  };

  const add = async () => {
    try {
      setSaving(true);
      setError(null);
      const created = await paymentMethodApi.create(nickname);
      setMethods(prev => [...prev, created]);
      onChange(created.id);
      setAdding(false);
      setNickname('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment method');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setAdding(false);
    setNickname('');
    setError(null);
  };

  return (
    <Stack gap={4}>
      <Select id={`${uid}-select`} label={label} placeholder="Optional" data={data} value={value} onChange={pick} searchable clearable />
      {adding && (
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            id={`${uid}-new`}
            style={{ flex: 1 }}
            label="New payment method"
            placeholder="e.g. Southwest CC - 1234"
            description="A nickname only — never a full card number"
            value={nickname}
            onChange={e => setNickname(e.currentTarget.value)}
          />
          <Button size="xs" onClick={add} loading={saving} disabled={!nickname.trim()}>Add</Button>
          <Button size="xs" variant="default" onClick={cancel}>Cancel</Button>
        </Group>
      )}
      {error && <Text size="xs" c="red">{error}</Text>}
    </Stack>
  );
}
