import { ActionIcon, Button, Group, Stack, TextInput } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { CouponDraft } from '../utils/roomDraft';

interface CouponsEditorProps {
  coupons: CouponDraft[];
  onChange: (coupons: CouponDraft[]) => void;
}

export function CouponsEditor({ coupons, onChange }: CouponsEditorProps) {
  const update = (index: number, patch: Partial<CouponDraft>) =>
    onChange(coupons.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <Stack gap={4}>
      {coupons.map((coupon, index) => (
        <Group key={index} gap="xs" wrap="wrap" align="flex-end">
          <TextInput aria-label={`Coupon code ${index + 1}`} placeholder="Code" value={coupon.code} onChange={e => update(index, { code: e.currentTarget.value })} style={{ flex: '1 1 8rem' }} />
          <TextInput aria-label={`Coupon savings $ ${index + 1}`} placeholder="Savings $" type="number" step="0.01" value={coupon.savingsCash} onChange={e => update(index, { savingsCash: e.currentTarget.value })} w={100} />
          <TextInput aria-label={`Coupon savings pts ${index + 1}`} placeholder="Savings pts" type="number" step="1" value={coupon.savingsPoints} onChange={e => update(index, { savingsPoints: e.currentTarget.value })} w={110} />
          <TextInput aria-label={`Coupon note ${index + 1}`} placeholder="Note" value={coupon.notes} onChange={e => update(index, { notes: e.currentTarget.value })} style={{ flex: '2 1 10rem' }} />
          <ActionIcon variant="subtle" color="gray" mb={4} aria-label={`Remove coupon ${index + 1}`} onClick={() => onChange(coupons.filter((_, i) => i !== index))}>
            <IconX size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Button variant="subtle" size="compact-sm" style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...coupons, { code: '', savingsCash: '', savingsPoints: '', notes: '' }])}>
        + Coupon
      </Button>
    </Stack>
  );
}
