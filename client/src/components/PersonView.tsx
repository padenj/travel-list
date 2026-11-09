import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Button, Checkbox, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { CategoryInfo, DashboardItem, DestinationGroup, groupItemsByCategory, orderPeople, partitionItems, remainingFor } from '../utils/dashboardGroups';
import { useOnline } from '../utils/useOnline';
import { getSwipeDirection, isSwipeBlocked } from '../utils/swipe';

export interface PersonViewProps {
  groups: DestinationGroup[];
  isTrip: boolean;
  currentUserId: string | null;
  onCheckItem: (listId: string, userId: string | null, itemId: string, checked: boolean) => void;
  onToggleNotNeeded: (listId: string, userId: string | null, itemId: string) => void;
  onOpenAddDrawer: (listId: string, userId: string | null) => void;
  onItemHistory: (listId: string, packingListItemId: string, name: string) => void;
  onMoveSharedItem: (fromListId: string, itemId: string, toListId: string) => void;
  onSelectedGroupChange?: (listId: string) => void;
  categories?: CategoryInfo[];
}

interface MoveTarget {
  listId: string;
  name: string;
}

interface RowActions {
  onCheck: (itemId: string, checked: boolean) => void;
  onToggleNotNeeded: (itemId: string) => void;
  onHistory: (item: DashboardItem) => void;
  moveTargets: MoveTarget[];
  onMove: (itemId: string, toListId: string) => void;
  online: boolean;
}

function ItemRow({ item, notNeeded, actions }: { item: DashboardItem; notNeeded: boolean; actions: RowActions }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs" style={{ minHeight: 44 }}>
      <Checkbox
        size="md"
        checked={item.checked}
        onChange={e => actions.onCheck(item.id, e.currentTarget.checked)}
        label={
          <span style={{ overflowWrap: 'anywhere', ...(notNeeded ? { textDecoration: 'line-through', color: 'var(--mantine-color-dimmed)' } : {}) }}>
            {item.name}
          </span>
        }
        style={{ flex: 1, minWidth: 0 }}
      />
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label={`More actions for ${item.name}`}>
            <IconDots size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => actions.onToggleNotNeeded(item.id)}>{notNeeded ? 'Needed after all' : 'Not needed'}</Menu.Item>
          {actions.moveTargets.map(target => (
            <Menu.Item key={target.listId} disabled={!actions.online} onClick={() => actions.onMove(item.id, target.listId)}>
              {actions.online ? `Move to ${target.name}` : `Move to ${target.name} (needs a connection)`}
            </Menu.Item>
          ))}
          <Menu.Item onClick={() => actions.onHistory(item)}>History</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

function CategorizedRows({ items, categories, notNeededIds, actions }: {
  items: DashboardItem[];
  categories: CategoryInfo[];
  notNeededIds: string[];
  actions: RowActions;
}) {
  const row = (it: DashboardItem) => <ItemRow key={it.id} item={it} notNeeded={notNeededIds.includes(it.id)} actions={actions} />;
  if (categories.length === 0) return <>{items.map(row)}</>;
  return (
    <>
      {groupItemsByCategory(items, categories).map(section => (
        <div key={section.key} role="group" aria-label={section.name}>
          <Text component="h4" size="xs" fw={700} c="dimmed" tt="uppercase" mt={8} mb={2}>{section.name}</Text>
          {section.items.map(row)}
        </div>
      ))}
    </>
  );
}

function ItemSection({ title, color, items, notNeededIds, onAdd, actions, categories }: {
  title: string;
  categories: CategoryInfo[];
  color: string | null;
  items: DashboardItem[];
  notNeededIds: string[];
  onAdd: () => void;
  actions: RowActions;
}) {
  const [expanded, setExpanded] = useState(false);
  const { todo, packed, notNeeded } = partitionItems(items, notNeededIds);
  const summary = [
    packed.length > 0 ? `${packed.length} packed` : null,
    notNeeded.length > 0 ? `${notNeeded.length} not needed` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section
      aria-label={title}
      style={{
        border: '1px solid var(--mantine-color-gray-3)',
        borderLeft: `4px solid var(--mantine-color-${color || 'gray'}-6)`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Text fw={600}>{title}</Text>
        <ActionIcon variant="light" size="lg" aria-label={`Add item to ${title}`} onClick={onAdd}>
          <IconPlus size={18} />
        </ActionIcon>
      </Group>
      {items.length === 0 && <Text size="sm" c="dimmed">No items yet</Text>}
      <CategorizedRows items={todo} categories={categories} notNeededIds={notNeededIds} actions={actions} />
      {summary && (
        <UnstyledButton onClick={() => setExpanded(v => !v)} aria-expanded={expanded} style={{ minHeight: 44, width: '100%' }}>
          <Text size="sm" c="dimmed">{`${expanded ? '▾' : '▸'} ${summary}`}</Text>
        </UnstyledButton>
      )}
      {expanded && <CategorizedRows items={[...packed, ...notNeeded]} categories={categories} notNeededIds={notNeededIds} actions={actions} />}
    </section>
  );
}

export default function PersonView({
  groups, isTrip, currentUserId, onCheckItem, onToggleNotNeeded, onOpenAddDrawer, onItemHistory, onMoveSharedItem, onSelectedGroupChange,
  categories = [],
}: PersonViewProps) {
  const people = useMemo(() => orderPeople(groups, currentUserId), [groups, currentUserId]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const online = useOnline();
  const areaRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchBlocked = useRef(false);

  // orderPeople puts the current user first, so the default is "me" when I'm on this trip.
  const selected = people.find(p => p.userId === selectedId) ?? people[0] ?? null;
  const selectedListId = selected?.listId ?? null;

  useEffect(() => {
    if (selectedListId && onSelectedGroupChange) onSelectedGroupChange(selectedListId);
  }, [selectedListId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selected chip visible when a swipe selects someone scrolled out of the chip row.
  // Not on the first selection, so opening the dashboard doesn't move the page.
  const selectedUserId = selected?.userId ?? null;
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastScrolledUserId = useRef(selectedUserId);
  useEffect(() => {
    if (lastScrolledUserId.current === selectedUserId) return;
    const previous = lastScrolledUserId.current;
    lastScrolledUserId.current = selectedUserId;
    if (previous === null) return;
    const chip = selectedUserId ? chipRefs.current.get(selectedUserId) : undefined;
    chip?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selectedUserId]);

  const sharedActionsFor = (g: DestinationGroup): RowActions => ({
    onHistory: it => onItemHistory(g.listId, it.id, it.name),
    online,
    onMove: (itemId, toListId) => onMoveSharedItem(g.listId, itemId, toListId),
    onCheck: (itemId, checked) => onCheckItem(g.listId, null, itemId, checked),
    onToggleNotNeeded: itemId => onToggleNotNeeded(g.listId, null, itemId),
    moveTargets: isTrip ? groups.filter(o => o.listId !== g.listId).map(o => ({ listId: o.listId, name: o.name })) : [],
  });
  const peopleListIds = new Set(people.map(p => p.listId));
  const memberlessGroups = groups.filter(g => !peopleListIds.has(g.listId));
  const renderMemberless = () => memberlessGroups
    .filter(g => selected || g.wholeFamilyItems.length > 0)
    .map(g => (
      <ItemSection
        key={`${g.listId}:shared`}
        title={`${g.name} — shared`}
        color={g.color}
        items={g.wholeFamilyItems}
        notNeededIds={g.notNeededWhole}
        onAdd={() => onOpenAddDrawer(g.listId, null)}
        actions={sharedActionsFor(g)}
        categories={categories}
      />
    ));

  if (!selected) {
    if (!groups.some(g => g.wholeFamilyItems.length > 0)) return <Text c="dimmed">No travelers on this list yet.</Text>;
    return <Stack gap="md" data-testid="person-view">{renderMemberless()}</Stack>;
  }

  const group = groups[selected.groupIndex];
  const personalItems = group.userLists.find(l => l.userId === selected.userId)?.items ?? [];
  const moveTargets = isTrip ? groups.filter(g => g.listId !== group.listId).map(g => ({ listId: g.listId, name: g.name })) : [];

  const step = (delta: 1 | -1) => {
    const next = people[people.findIndex(p => p.userId === selected.userId) + delta];
    if (next) setSelectedId(next.userId);
  };

  const baseActions = {
    onHistory: (it: DashboardItem) => onItemHistory(group.listId, it.id, it.name),
    online,
    onMove: (itemId: string, toListId: string) => onMoveSharedItem(group.listId, itemId, toListId),
  };
  const personalActions: RowActions = {
    ...baseActions,
    onCheck: (itemId, checked) => onCheckItem(group.listId, selected.userId, itemId, checked),
    onToggleNotNeeded: itemId => onToggleNotNeeded(group.listId, selected.userId, itemId),
    moveTargets: [],
  };
  const sharedActions: RowActions = {
    ...baseActions,
    onCheck: (itemId, checked) => onCheckItem(group.listId, null, itemId, checked),
    onToggleNotNeeded: itemId => onToggleNotNeeded(group.listId, null, itemId),
    moveTargets,
  };

  return (
    <div
      ref={areaRef}
      data-testid="person-view"
      onTouchStart={e => {
        const t = e.touches[0];
        touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
        touchBlocked.current = isSwipeBlocked(e.target, areaRef.current);
      }}
      onTouchEnd={e => {
        const start = touchStart.current;
        const t = e.changedTouches[0];
        touchStart.current = null;
        if (!start || !t || touchBlocked.current) return;
        const direction = getSwipeDirection(start, { x: t.clientX, y: t.clientY });
        if (direction === 'left') step(1);
        if (direction === 'right') step(-1);
      }}
    >
      <div
        role="toolbar"
        aria-label="Travelers"
        data-no-swipe
        style={{ position: 'sticky', top: 'var(--app-shell-header-offset, 0px)', zIndex: 2, background: 'var(--mantine-color-body)', overflowX: 'auto', padding: '8px 0' }}
      >
        <Group wrap="nowrap" gap="xs">
          {people.map(p => {
            const g = groups[p.groupIndex];
            const remaining = remainingFor(g, p.userId);
            const isSelected = p.userId === selected.userId;
            return (
              <Button
                key={p.userId}
                ref={el => {
                  if (el) chipRefs.current.set(p.userId, el);
                  else chipRefs.current.delete(p.userId);
                }}
                radius="xl"
                size="md"
                color={g.color || 'blue'}
                variant={isSelected ? 'filled' : 'light'}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(p.userId)}
                style={{ flexShrink: 0, minHeight: 44 }}
              >
                {`${p.userName} ${remaining === 0 ? '✓' : remaining}`}
              </Button>
            );
          })}
        </Group>
      </div>
      <Stack gap="md" mt="sm">
        <ItemSection
          key={`${selected.userId}:personal`}
          title={isTrip ? `${selected.userName} · ${group.name}` : selected.userName}
          color={group.color}
          items={personalItems}
          notNeededIds={group.notNeededByUser[selected.userId] || []}
          onAdd={() => onOpenAddDrawer(group.listId, selected.userId)}
          actions={personalActions}
          categories={categories}
        />
        <ItemSection
          key={`${group.listId}:shared`}
          title={isTrip ? `${group.name} shared` : 'Shared'}
          color={group.color}
          items={group.wholeFamilyItems}
          notNeededIds={group.notNeededWhole}
          onAdd={() => onOpenAddDrawer(group.listId, null)}
          actions={sharedActions}
          categories={categories}
        />
        {renderMemberless()}
      </Stack>
    </div>
  );
}
