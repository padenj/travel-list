import React, { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Collapse, Divider, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconRefresh } from '@tabler/icons-react';
import { getPackingListAudit } from '../api';

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

function formatAction(a: PackingListAuditItem): string {
  switch (a.action) {
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
      return a.action;
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

export default function PackingListAuditPanel(props: {
  packingListId: string | null;
  refreshKey?: number;
  onItemClick?: (packingListItemId: string, itemName: string) => void;
}): React.ReactElement {
  const { packingListId, refreshKey = 0, onItemClick } = props;
  const [opened, setOpened] = useState(false);
  const [items, setItems] = useState<PackingListAuditItem[]>([]);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const canLoadMore = !!nextBeforeId;

  const title = useMemo(() => {
    return `Activity`;
  }, []);

  const refresh = async () => {
    if (!packingListId) return;
    setLoading(true);
    try {
      const res = await getPackingListAudit(packingListId, { limit: 50 });
      if (res.response.ok) {
        setItems((res.data && res.data.items) || []);
        setNextBeforeId((res.data && res.data.nextBeforeId) || null);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!packingListId || !nextBeforeId) return;
    setLoadingMore(true);
    try {
      const res = await getPackingListAudit(packingListId, { limit: 50, beforeId: nextBeforeId });
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
  }, [opened, packingListId]);

  useEffect(() => {
    if (!opened) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <Paper withBorder radius="md" p="sm" style={{ position: 'relative' }}>
      <Group justify="space-between" align="center">
        <Group gap="xs" align="center">
          <Text fw={700} size="sm">{title}</Text>
          <Badge variant="light" size="sm">{items.length}</Badge>
        </Group>
        <Group gap="xs">
          <ActionIcon variant="subtle" onClick={() => refresh()} aria-label="Refresh activity" disabled={!opened || loading || !packingListId}>
            <IconRefresh size={16} />
          </ActionIcon>
          <ActionIcon variant="light" onClick={() => setOpened(o => !o)} aria-label={opened ? 'Hide activity' : 'Show activity'}>
            {opened ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
          </ActionIcon>
        </Group>
      </Group>

      <Collapse in={opened}>
        <Divider my="sm" />
        {!packingListId ? (
          <Text size="sm" c="dimmed">Select a packing list to view activity.</Text>
        ) : (
          <Stack gap="xs">
            <ScrollArea h={220} type="auto">
              <Stack gap={6} pr="sm">
                {items.length === 0 ? (
                  <Text size="sm" c="dimmed">No activity yet.</Text>
                ) : (
                  items.map((a) => {
                    const actionText = formatAction(a);
                    const appliesTo = formatAppliesTo(a);
                    const itemName = extractItemName(a.details) || 'Item';
                    const title = `${itemName} - ${appliesTo}`;
                    const itemClickable = !!(onItemClick && a.packingListItemId);
                    return (
                      <Paper key={a.id} withBorder radius="sm" p="xs">
                        <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              size="sm"
                              fw={700}
                              style={{ lineHeight: 1.25, cursor: itemClickable ? 'pointer' : undefined, textDecoration: itemClickable ? 'underline' : undefined }}
                              onClick={() => {
                                if (itemClickable && a.packingListItemId) {
                                  onItemClick(a.packingListItemId, itemName);
                                }
                              }}
                            >
                              {title}
                            </Text>
                            <Text size="sm" style={{ lineHeight: 1.2 }}>
                              {actionText}
                            </Text>
                          </Stack>
                          <Stack gap={2} style={{ alignItems: 'flex-end' }}>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', lineHeight: 1.2 }}>{formatTimestamp(a.createdAt)}</Text>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', lineHeight: 1.2 }}>{a.actorName}</Text>
                          </Stack>
                        </Group>
                      </Paper>
                    );
                  })
                )}
              </Stack>
            </ScrollArea>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Shows most recent 50; load more for older.</Text>
              <Button variant="light" size="xs" onClick={loadMore} disabled={!canLoadMore || loadingMore}>
                {loadingMore ? 'Loading…' : (canLoadMore ? 'Load more' : 'No more')}
              </Button>
            </Group>
          </Stack>
        )}
      </Collapse>
    </Paper>
  );
}
