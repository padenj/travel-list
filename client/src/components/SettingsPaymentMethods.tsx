import React, { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Card, Group, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconArchive, IconArchiveOff, IconPencil, IconTrash } from '@tabler/icons-react';
import { PaymentMethod } from '../types/trip';
import { paymentMethodApi } from '../api/paymentMethodApi';

const countLabel = (n: number) => `${n} transaction${n === 1 ? '' : 's'}`;

export default function SettingsPaymentMethods(): React.ReactElement {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [nickname, setNickname] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMethods(await paymentMethodApi.list(true));
  }, []);

  useEffect(() => {
    load().catch(err => setError(err instanceof Error ? err.message : 'Failed to load payment methods'));
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      setError(null);
      await action();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    }
  };

  const add = async () => {
    if (await run(() => paymentMethodApi.create(nickname))) setNickname('');
  };

  const saveRename = async (id: string) => {
    if (await run(() => paymentMethodApi.update(id, { nickname: renameValue }))) setRenamingId(null);
  };

  return (
    <Card>
      <Stack gap="sm">
        <div>
          <Text fw={600}>Payment methods</Text>
          <Text size="sm" c="dimmed">
            Nicknames for the cards and accounts your family pays with, e.g. "Southwest CC - 1234". Never enter a full card number.
          </Text>
        </div>
        {error && <Alert color="red">{error}</Alert>}

        <Group gap="xs" align="flex-end">
          <TextInput
            style={{ flex: 1 }}
            label="New payment method"
            placeholder="e.g. Southwest CC - 1234"
            value={nickname}
            onChange={e => setNickname(e.currentTarget.value)}
          />
          <Button onClick={add} disabled={!nickname.trim()}>Add</Button>
        </Group>

        {methods.length === 0 ? (
          <Text size="sm" c="dimmed">No payment methods yet</Text>
        ) : (
          <Table verticalSpacing="xs">
            <Table.Tbody>
              {methods.map(m => (
                <Table.Tr key={m.id} style={m.archived ? { opacity: 0.6 } : undefined}>
                  <Table.Td>
                    {renamingId === m.id ? (
                      <Group gap="xs" wrap="nowrap">
                        <TextInput
                          size="xs"
                          aria-label={`Nickname for ${m.nickname}`}
                          value={renameValue}
                          onChange={e => setRenameValue(e.currentTarget.value)}
                        />
                        <Button size="compact-xs" onClick={() => saveRename(m.id)}>Save</Button>
                        <Button size="compact-xs" variant="default" onClick={() => setRenamingId(null)}>Cancel</Button>
                      </Group>
                    ) : (
                      <Group gap="xs">
                        <Text size="sm">{m.nickname}</Text>
                        {m.archived && <Badge size="xs" color="gray">Archived</Badge>}
                      </Group>
                    )}
                  </Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{countLabel(m.transactionCount)}</Text></Table.Td>
                  <Table.Td ta="right">
                    {confirmingId === m.id ? (
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Text size="xs">Delete?</Text>
                        <Button size="compact-xs" color="red" onClick={async () => { await run(() => paymentMethodApi.remove(m.id)); setConfirmingId(null); }}>Confirm</Button>
                        <Button size="compact-xs" variant="default" onClick={() => setConfirmingId(null)}>Cancel</Button>
                      </Group>
                    ) : (
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <ActionIcon variant="subtle" size="sm" aria-label={`Rename ${m.nickname}`}
                          onClick={() => { setRenamingId(m.id); setRenameValue(m.nickname); }}>
                          <IconPencil size={14} />
                        </ActionIcon>
                        {m.archived ? (
                          <ActionIcon variant="subtle" size="sm" aria-label={`Unarchive ${m.nickname}`}
                            onClick={() => run(() => paymentMethodApi.update(m.id, { archived: false }))}>
                            <IconArchiveOff size={14} />
                          </ActionIcon>
                        ) : (
                          <ActionIcon variant="subtle" size="sm" aria-label={`Archive ${m.nickname}`}
                            onClick={() => run(() => paymentMethodApi.update(m.id, { archived: true }))}>
                            <IconArchive size={14} />
                          </ActionIcon>
                        )}
                        {m.transactionCount === 0 && (
                          <ActionIcon variant="subtle" color="red" size="sm" aria-label={`Delete ${m.nickname}`}
                            onClick={() => setConfirmingId(m.id)}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        )}
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}
