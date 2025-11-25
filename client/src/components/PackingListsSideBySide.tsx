import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Text, Stack, Checkbox, ScrollArea, ActionIcon, useMantineTheme } from '@mantine/core';
import { getCategories } from '../api';
import { IconHexagonMinus, IconRotateClockwise, IconPlus, IconEdit } from '@tabler/icons-react';
import ItemEditDrawer from './ItemEditDrawer';

export interface PackingListProps {
  userLists: { userId: string; userName: string; items: { id: string; name: string; checked: boolean; masterId?: string | null; added_during_packing?: boolean; display_name?: string | null; masterIsOneOff?: boolean }[] }[];
  wholeFamilyItems: { id: string; name: string; checked: boolean; masterId?: string | null; added_during_packing?: boolean; display_name?: string | null; masterIsOneOff?: boolean }[];
  onCheckItem: (userId: string | null, itemId: string, checked: boolean) => void;
  notNeededByUser?: Record<string, string[]>;
  notNeededWhole?: string[];
  onToggleNotNeeded?: (userId: string | null, itemId: string) => void;
  onOpenAddDrawer?: (userId: string | null) => void;
  showWhole?: boolean;
  // active list id and family id are needed to edit/remove one-off packing-list items
  activeListId?: string | null;
  familyId?: string | null;
  onRefresh?: () => void;
}

const ItemLabel: React.FC<{ text: string; checked?: boolean }> = ({ text, checked }) => {
  const theme = useMantineTheme();
  const checkedColor = theme.colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6];
  return (
    <span style={{ fontSize: 13, lineHeight: '1.1', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: checked ? checkedColor : undefined }}>{text}</span>
  );
};

const ItemRow: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean; onToggleNotNeeded?: () => void; onEdit?: () => void }> = React.memo(({ checked, onChange, label, disabled, onToggleNotNeeded, onEdit }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
      <Checkbox
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        styles={{ body: { padding: 0 } }}
        aria-label={label}
        disabled={disabled}
      />
      <ItemLabel text={label} checked={checked} />
      {onToggleNotNeeded ? (
        <ActionIcon size="sm" variant="subtle" onClick={onToggleNotNeeded} aria-label="Not needed">
          <IconHexagonMinus size={14} />
        </ActionIcon>
      ) : null}
      {onEdit ? (
        <ActionIcon size="sm" variant="light" onClick={onEdit} aria-label="Edit one-off">
          <IconEdit size={14} />
        </ActionIcon>
      ) : null}
    </div>
  );
});

export function PackingListsSideBySide({ userLists, wholeFamilyItems, onCheckItem, notNeededByUser = {}, notNeededWhole = [], onToggleNotNeeded, onOpenAddDrawer, showWhole = true, activeListId, familyId, onRefresh }: PackingListProps) {

  // Measure available viewport height from the top of this component down to
  // the bottom of the window so columns can fill the visible area without
  // forcing the whole page to scroll when interacting with an inner list.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  // placeholder for master id if we later wire promotion flow
  const [editInitialName, setEditInitialName] = useState<string | undefined>(undefined);
  const [editMasterItemId, setEditMasterItemId] = useState<string | null | undefined>(undefined);
  const [promoteContext, setPromoteContext] = useState<{ listId: string; packingListItemId: string } | null>(null);
  const [editInitialCategoryId, setEditInitialCategoryId] = useState<string | null | undefined>(undefined);
  const [editInitialMembers, setEditInitialMembers] = useState<string[] | undefined>(undefined);
  const [editInitialWhole, setEditInitialWhole] = useState<boolean | undefined>(undefined);
  const [categories, setCategories] = useState<any[]>([]);

  // Load family categories so we can render lists grouped by the configured category order
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!familyId) return setCategories([]);
      try {
        const res = await getCategories(familyId);
        if (mounted && res && res.response && res.response.ok) {
          const cats = res.data.categories || [];
          // If categories have a numeric `position` use it; otherwise keep server order
          cats.sort((a: any, b: any) => {
            if (typeof a.position === 'number' && typeof b.position === 'number') return a.position - b.position;
            return 0;
          });
          setCategories(cats);
        }
      } catch (err) {
        // ignore - grouping will just fall back to uncategorized
      }
    })();
    return () => { mounted = false; };
  }, [familyId]);

  // Helper: detect if a packing-list row should be treated as a one-off.
  // Server/clients have historically used different shapes (snake_case vs camelCase)
  // and sometimes used flags like `added_during_packing` or `masterIsOneOff`.
  const isOneOffItem = (i: any) => {
    return !!(
      i?.added_during_packing ||
      i?.addedDuringPacking ||
      i?.master_is_one_off ||
      i?.masterIsOneOff ||
      i?.one_off ||
      i?.oneOff
    );
  };

  useEffect(() => {
    let rafId: number | null = null;
    const recalc = () => {
      if (!wrapperRef.current) return;
      const top = wrapperRef.current.getBoundingClientRect().top;
      // Leave a small bottom gap so controls/footers are not covered.
      const gap = 16;
      const h = Math.max(180, window.innerHeight - top - gap);
      setAvailableHeight(h);
    };
    const schedule = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(recalc);
    };
    // initial
    recalc();
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    // also listen for orientation changes on mobile
    window.addEventListener('orientationchange', schedule, { passive: true });
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, []);

  // Render lists horizontally in a scrollable row. Each column is a simple
  // div (no Card box). Between columns we render a subtle vertical Divider.
  return (
    <div ref={wrapperRef} style={{ display: 'flex', overflowX: 'auto', gap: 0, alignItems: 'stretch' }}>
      {/* Single ItemEditDrawer instance so it can be opened from any column */}
      <ItemEditDrawer
        opened={showEditDrawer}
        onClose={() => { setShowEditDrawer(false); setEditInitialName(undefined); setPromoteContext(null); setEditMasterItemId(undefined); }}
        masterItemId={editMasterItemId}
        initialName={editInitialName}
        familyId={familyId}
        initialCategoryId={editInitialCategoryId}
        initialMembers={editInitialMembers}
        initialWhole={editInitialWhole}
        showIsOneOffCheckbox={true}
        promoteContext={promoteContext}
        zIndex={2000}
        onSaved={async () => {
          setShowEditDrawer(false);
          setEditInitialName(undefined);
          setEditMasterItemId(undefined);
          setEditInitialCategoryId(undefined);
          setEditInitialMembers(undefined);
          setEditInitialWhole(undefined);
          setPromoteContext(null);
          if (onRefresh) onRefresh();
        }}
      />
      {/* Whole Family column first (force left-most) */}
  {showWhole ? (
  <div style={{ minWidth: 165, padding: '8px 12px', paddingLeft: 14, /* fill most of viewport height; computed dynamically */ height: availableHeight ? `${availableHeight}px` : '60vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text size="sm" fw={600}>Whole Family</Text>
          {onOpenAddDrawer ? (
            <ActionIcon size="sm" variant="light" onClick={() => onOpenAddDrawer(null)} aria-label="Add one-off to whole family">
              <IconPlus size={14} />
            </ActionIcon>
          ) : null}
        </div>
        <ScrollArea style={{ flex: 1 }}>
          <Stack style={{ gap: 6 }}>
            {wholeFamilyItems.length === 0 ? (
              <span style={{ color: '#888', fontSize: 13 }}>No items assigned</span>
            ) : (
              (() => {
                const notNeeded = new Set(notNeededWhole || []);
                const oneOff = wholeFamilyItems.filter(i => isOneOffItem(i));
                const regular = wholeFamilyItems.filter(i => !isOneOffItem(i));
                const active = regular.filter(i => !notNeeded.has(i.id));
                const dismissed = regular.filter(i => notNeeded.has(i.id));
                const oneOffActive = oneOff.filter(i => !notNeeded.has(i.id));
                const oneOffDismissed = oneOff.filter(i => notNeeded.has(i.id));
                return (
                  <div>
                    {active.map(item => (
                      <ItemRow
                        key={item.id}
                        checked={item.checked}
                        onChange={(v) => onCheckItem(null, item.id, v)}
                        label={item.name}
                        onToggleNotNeeded={onToggleNotNeeded ? (() => onToggleNotNeeded(null, item.id)) : undefined}
                      />
                    ))}

                    {/* One-off section for whole-family column */}
                    {oneOffActive.length > 0 ? (
                      <div style={{ marginTop: 10 }}>
                        <Text size="xs" fw={700}>One-off</Text>
                        {oneOffActive.map(item => (
                          <ItemRow
                            key={item.id}
                            checked={item.checked}
                            onChange={(v) => onCheckItem(null, item.id, v)}
                            label={item.name}
                            onToggleNotNeeded={onToggleNotNeeded ? (() => onToggleNotNeeded(null, item.id)) : undefined}
                            onEdit={() => {
                              const masterIdWhole = (item as any).item_id || (item as any).master_id || (item as any).itemId || (item as any).masterId || null;
                              setPromoteContext({ listId: activeListId || '', packingListItemId: item.id });
                              setEditMasterItemId(masterIdWhole);
                              setEditInitialName(item.display_name || item.name);
                              setEditInitialCategoryId((item as any).category ? (item as any).category.id : undefined);
                              setEditInitialMembers((item as any).members ? (item as any).members.map((m: any) => m.id) : undefined);
                              setEditInitialWhole(!!(item as any).whole_family);
                              setShowEditDrawer(true);
                            }}
                          />
                        ))}
                      </div>
                    ) : null}

                      {(dismissed.length > 0 || oneOffDismissed.length > 0) ? (
                        <div style={{ marginTop: 8 }}>
                          <Text size="xs" c="dimmed">Not needed</Text>
                          {[...dismissed, ...oneOffDismissed].map(item => (
                            <ItemRow
                              key={item.id}
                              checked={item.checked}
                              onChange={() => { /* noop for disabled */ }}
                              label={item.name}
                              disabled={true}
                              onToggleNotNeeded={onToggleNotNeeded ? (() => onToggleNotNeeded(null, item.id)) : undefined}
                            />
                          ))}
                        </div>
                      ) : null}
                  </div>
                );
              })()
            )}
          </Stack>
        </ScrollArea>
    </div>
  ) : null}

  {userLists.map((list) => (
        <div key={list.userId + '-wrap'} style={{ display: 'flex', alignItems: 'stretch' }}>
          <div
            key={list.userId}
            style={{ minWidth: 165, padding: '8px 12px', paddingLeft: 14, borderLeft: '2px solid #e0e0e0', /* fill most of viewport height; computed dynamically */ height: availableHeight ? `${availableHeight}px` : '60vh', display: 'flex', flexDirection: 'column' }}
          >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text size="sm" fw={600}>{list.userName}'s List</Text>
            {onOpenAddDrawer ? (
              <ActionIcon size="sm" variant="light" onClick={() => onOpenAddDrawer(list.userId)} aria-label="Add one-off">
                <IconPlus size={14} />
              </ActionIcon>
            ) : null}
          </div>
          <ScrollArea style={{ flex: 1 }}>
            <Stack style={{ gap: 6 }}>
              {list.items.length === 0 ? (
                <span style={{ color: '#888', fontSize: 13 }}>No items assigned</span>
              ) : (
                (() => {
                  const notNeeded = new Set(notNeededByUser[list.userId] || []);
                  // Treat an item as one-off if added during packing, it has no masterId,
                  // or if the referenced master item itself is marked as a one-off.
                  const oneOff = list.items.filter(i => isOneOffItem(i));
                  const regular = list.items.filter(i => !isOneOffItem(i));
                  const active = regular.filter(i => !notNeeded.has(i.id));
                  const dismissed = regular.filter(i => notNeeded.has(i.id));
                  const oneOffActive = oneOff.filter(i => !notNeeded.has(i.id));
                  const oneOffDismissed = oneOff.filter(i => notNeeded.has(i.id));
                  return (
                    <div>
                      {/* Regular items first */}
                      {/* Group regular (non-one-off) active items by category in configured order */}
                      {(() => {
                        // Build grouped map by category id (null for uncategorized)
                        const grouped = new Map<string | null, any[]>();
                        for (const it of active) {
                          const cid = (it as any).category && (it as any).category.id ? (it as any).category.id : null;
                          if (!grouped.has(cid)) grouped.set(cid, []);
                          grouped.get(cid)!.push(it);
                        }
                        const parts: any[] = [];
                        // Render categories in configured order
                        for (const cat of categories) {
                          const itemsForCat = grouped.get(cat.id) || [];
                          if (itemsForCat.length === 0) continue;
                          parts.push(
                            <div key={`cat-${cat.id}`} style={{ marginTop: 6 }}>
                              <Text size="xs" fw={700}>{cat.name}</Text>
                              {itemsForCat.map(item => (
                                <ItemRow
                                  key={item.id}
                                  checked={item.checked}
                                  onChange={(v) => onCheckItem(list.userId, item.id, v)}
                                  label={item.display_name || item.name}
                                  onToggleNotNeeded={onToggleNotNeeded ? (() => onToggleNotNeeded(list.userId, item.id)) : undefined}
                                />
                              ))}
                            </div>
                          );
                          grouped.delete(cat.id);
                        }
                        // Remaining uncategorized items (null key)
                        const uncats = grouped.get(null) || [];
                        if (uncats.length > 0) {
                          parts.push(
                            <div key="cat-uncategorized" style={{ marginTop: 6 }}>
                              <Text size="xs" fw={700}>Uncategorized</Text>
                              {uncats.map(item => (
                                <ItemRow
                                  key={item.id}
                                  checked={item.checked}
                                  onChange={(v) => onCheckItem(list.userId, item.id, v)}
                                  label={item.display_name || item.name}
                                  onToggleNotNeeded={onToggleNotNeeded ? (() => onToggleNotNeeded(list.userId, item.id)) : undefined}
                                />
                              ))}
                            </div>
                          );
                        }
                        return parts;
                      })()}

                      {/* One-off items above Not needed */}
                      {/* One-off section for user column (rendered after grouped regular items) */}
                      {oneOffActive.length > 0 ? (
                        <div style={{ marginTop: 10 }}>
                          <Text size="xs" fw={700}>One-off</Text>
                          {oneOffActive.map(item => (
                            <ItemRow
                              key={item.id}
                              checked={item.checked}
                              onChange={(v) => onCheckItem(list.userId, item.id, v)}
                              label={item.display_name || item.name}
                              onToggleNotNeeded={onToggleNotNeeded ? (() => onToggleNotNeeded(list.userId, item.id)) : undefined}
                              onEdit={() => {
                                const masterIdUser = (item as any).item_id || (item as any).master_id || (item as any).itemId || (item as any).masterId || null;
                                setPromoteContext({ listId: activeListId || '', packingListItemId: item.id });
                                setEditMasterItemId(masterIdUser);
                                setEditInitialName(item.display_name || item.name);
                                setEditInitialCategoryId((item as any).category ? (item as any).category.id : undefined);
                                setEditInitialMembers((item as any).members ? (item as any).members.map((m: any) => m.id) : undefined);
                                setEditInitialWhole(!!(item as any).whole_family);
                                setShowEditDrawer(true);
                              }}
                            />
                          ))}
                        </div>
                      ) : null}

                      {(dismissed.length > 0 || oneOffDismissed.length > 0) ? (
                        <div style={{ marginTop: 8 }}>
                          <Text size="xs" c="dimmed">Not needed</Text>
                          {[...dismissed, ...oneOffDismissed].map(item => (
                            <ItemRow
                              key={item.id}
                              checked={item.checked}
                              onChange={() => { /* noop for disabled */ }}
                              label={item.display_name || item.name}
                              disabled={true}
                              onToggleNotNeeded={onToggleNotNeeded ? (() => onToggleNotNeeded(list.userId, item.id)) : undefined}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })()
              )}
            </Stack>
          </ScrollArea>
          </div>
          {/* No standalone separator: each user column uses a left border so dividers run full column height */}
        </div>
      ))}
    </div>
  );
}
