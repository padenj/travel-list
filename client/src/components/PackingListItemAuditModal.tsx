import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Divider, Group, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { getPackingListItemAudit } from '../api';

export type PackingListAuditItem = {
  id: number;
  packingListId: string;
  packingListItemId: string | null;
  actorUserId: string | null;
  actorName: string;
  action: string;
  appliesToScope: 'family' | 'member';
  appliesToMemberId: string | null;
  appliesToMemberName: string | null;
  details: string | null;
  createdAt: string;
};

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function formatAction(action: string): string {
  switch (action) {
    case 'ITEM_CHECKED':
      return 'checked';
    case 'ITEM_UNCHECKED':
      return 'unchecked';
    case 'ITEM_NOT_NEEDED':
      return 'marked not needed';
    case 'ITEM_NEEDED':
      return 'marked needed';
    case 'ITEM_ADDED':
      return 'added';
    case 'ITEM_REMOVED':
      return 'removed';
    default:
      return action;
  }
}

function extractItemName(details: string | null | undefined): string | null {
  if (!details) return null;
  const d = details.trim();
  const simple = /^(Checked|Unchecked|Added|Removed)\s+(.+)$/i.exec(d);
  if (simple && simple[2]) return simple[2].trim();
  const marked = /^Marked\s+(?:not\s+needed|needed)\s*:\s*(.+)$/i.exec(d);
  if (marked && marked[1]) return marked[1].trim();
  return null;
}

function formatAppliesTo(a: PackingListAuditItem): string {
  if (a.appliesToScope === 'family') return 'Whole family';
  if (a.appliesToMemberName) return a.appliesToMemberName;
  if (a.appliesToMemberId) return 'Member';
  return 'Members';
}

export default function PackingListItemAuditModal(props: {
  opened: boolean;
  onClose: () => void;
  packingListId: string | null;
  packingListItemId: string | null;
  itemName: string;
  refreshKey?: number;
}): React.ReactElement {
  const { opened, onClose, packingListId, packingListItemId, itemName, refreshKey = 0 } = props;
  const isSmall = useMediaQuery('(max-width: 36em)');

  const [items, setItems] = useState<PackingListAuditItem[]>([]);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const title = useMemo(() => itemName || 'Item history', [itemName]);

  const refresh = async () => {
    if (!packingListId || !packingListItemId) return;
    setLoading(true);
    try {
      const res = await getPackingListItemAudit(packingListId, packingListItemId, { limit: 50 });
      if (res.response.ok) {
        setItems((res.data && res.data.items) || []);
        setNextBeforeId((res.data && res.data.nextBeforeId) || null);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!packingListId || !packingListItemId || !nextBeforeId) return;
    setLoadingMore(true);
    try {
      const res = await getPackingListItemAudit(packingListId, packingListItemId, { limit: 50, beforeId: nextBeforeId });
      if (res.response.ok) {
        const newItems = (res.data && res.data.items) || [];
        setItems(prev => [...prev, ...newItems]);
        setNextBeforeId((res.data && res.data.nextBeforeId) || null);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!opened) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, packingListId, packingListItemId]);

  useEffect(() => {
    if (!opened) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Text fw={700}>{title}</Text>
          <Badge variant="light">{items.length}</Badge>
        </Group>
      }
      centered
      size={isSmall ? '100%' : 'sm'}
      fullScreen={!!isSmall}
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">Shows most recent 50; load more for older entries.</Text>
        <Divider />
        <ScrollArea h={isSmall ? '55vh' : 320} type="auto">
          <Stack gap={8}>
            {items.length === 0 ? (
              <Text size="sm" c="dimmed">No history yet.</Text>
            ) : (
              items.map(a => (
                <Stack key={a.id} gap={2} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, padding: 10 }}>
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" fw={700} style={{ lineHeight: 1.25 }}>
                        {(extractItemName(a.details) || title || 'Item') + ' - ' + formatAppliesTo(a)}
                      </Text>
                      <Text size="sm" style={{ lineHeight: 1.2 }}>{formatAction(a.action)}</Text>
                    </Stack>
                    <Stack gap={2} style={{ alignItems: 'flex-end' }}>
                      <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', lineHeight: 1.2 }}>{formatTimestamp(a.createdAt)}</Text>
                      <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', lineHeight: 1.2 }}>{a.actorName}</Text>
                    </Stack>
                  </Group>
                </Stack>
              ))
            )}
          </Stack>
        </ScrollArea>
        <Group justify="space-between">
          <Button variant="light" onClick={refresh} disabled={loading || !opened}>Refresh</Button>
          <Button onClick={loadMore} disabled={!nextBeforeId || loadingMore}>
            {loadingMore ? 'Loading…' : (nextBeforeId ? 'Load more' : 'No more')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
