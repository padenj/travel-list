import React, { useEffect, useRef, useState } from 'react';
import { Text, Stack, Checkbox, ScrollArea, ActionIcon } from '@mantine/core';
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

const ItemLabel: React.FC<{ text: string }> = ({ text }) => (
  <span style={{ fontSize: 13, lineHeight: '1.1', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
);

export function PackingListsSideBySide({ userLists, wholeFamilyItems, onCheckItem, notNeededByUser = {}, notNeededWhole = [], onToggleNotNeeded, onOpenAddDrawer, showWhole = true, activeListId, familyId, onRefresh }: PackingListProps) {

  // Measure available viewport height from the top of this component down to
  // the bottom of the window so columns can fill the visible area without
  // forcing the whole page to scroll when interacting with an inner list.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  // placeholder for master id if we later wire promotion flow
  const [editInitialName, setEditInitialName] = useState<string | undefined>(undefined);
  const [promoteContext, setPromoteContext] = useState<{ listId: string; packingListItemId: string } | null>(null);

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
        onClose={() => { setShowEditDrawer(false); setEditInitialName(undefined); setPromoteContext(null); }}
        masterItemId={null}
        initialName={editInitialName}
        familyId={familyId}
        showNameField={true}
        showIsOneOffCheckbox={true}
        promoteContext={promoteContext}
        zIndex={2000}
        onSaved={async () => {
          setShowEditDrawer(false);
          setEditInitialName(undefined);
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
                const oneOff = wholeFamilyItems.filter(i => i.added_during_packing || i.masterId == null || i.masterIsOneOff);
                const regular = wholeFamilyItems.filter(i => !(i.added_during_packing || i.masterId == null || i.masterIsOneOff));
                const active = regular.filter(i => !notNeeded.has(i.id));
                const dismissed = regular.filter(i => notNeeded.has(i.id));
                const oneOffActive = oneOff.filter(i => !notNeeded.has(i.id));
                const oneOffDismissed = oneOff.filter(i => notNeeded.has(i.id));
                return (
                  <div>
                    {active.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                        <Checkbox
                          checked={item.checked}
                          onChange={e => onCheckItem(null, item.id, e.target.checked)}
                          styles={{ body: { padding: 0 } }}
                          aria-label={item.name}
                        />
                        <ItemLabel text={item.name} />
                        {onToggleNotNeeded ? (
                          <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Not needed">
                            <IconHexagonMinus size={14} />
                          </ActionIcon>
                        ) : null}
                      </div>
                    ))}

                    {oneOffActive.length > 0 ? (
                        <div style={{ marginTop: 10 }}>
                          <Text size="xs" fw={700}>One-off</Text>
                          {oneOffActive.map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                              <Checkbox
                                checked={item.checked}
                                onChange={e => onCheckItem(null, item.id, e.target.checked)}
                                styles={{ body: { padding: 0 } }}
                                aria-label={item.name}
                              />
                              <ItemLabel text={item.name} />
                              {onToggleNotNeeded ? (
                                <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Not needed">
                                  <IconHexagonMinus size={14} />
                                </ActionIcon>
                              ) : null}
                              {/* Edit for one-off items: open edit drawer in promote mode */}
                              <ActionIcon size="sm" variant="light" onClick={() => {
                                setPromoteContext({ listId: activeListId || '', packingListItemId: item.id });
                                setEditInitialName(item.display_name || item.name);
                                setShowEditDrawer(true);
                              }} aria-label="Edit one-off">
                                <IconEdit size={14} />
                              </ActionIcon>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {(dismissed.length > 0 || oneOffDismissed.length > 0) ? (
                        <div style={{ marginTop: 8 }}>
                          <Text size="xs" c="dimmed">Not needed</Text>
                          {[...dismissed, ...oneOffDismissed].map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', color: '#888' }}>
                            <Checkbox disabled checked={item.checked} onChange={e => onCheckItem(null, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.name} />
                            <ItemLabel text={item.name} />
                            {onToggleNotNeeded ? (
                              <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Move to active">
                                <IconRotateClockwise size={14} />
                              </ActionIcon>
                            ) : null}
                          </div>
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
                  const oneOff = list.items.filter(i => i.added_during_packing || i.masterId == null || i.masterIsOneOff);
                  const regular = list.items.filter(i => !(i.added_during_packing || i.masterId == null || i.masterIsOneOff));
                  const active = regular.filter(i => !notNeeded.has(i.id));
                  const dismissed = regular.filter(i => notNeeded.has(i.id));
                  const oneOffActive = oneOff.filter(i => !notNeeded.has(i.id));
                  const oneOffDismissed = oneOff.filter(i => notNeeded.has(i.id));
                  return (
                    <div>
                      {/* Regular items first */}
                      {active.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                          <Checkbox
                            checked={item.checked}
                            onChange={e => onCheckItem(list.userId, item.id, e.target.checked)}
                            styles={{ body: { padding: 0 } }}
                            aria-label={item.display_name || item.name}
                          />
                          <ItemLabel text={item.display_name || item.name} />
                          {onToggleNotNeeded ? (
                            <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Not needed">
                              <IconHexagonMinus size={14} />
                            </ActionIcon>
                          ) : null}
                        </div>
                      ))}

                      {/* One-off items above Not needed */}
                      {oneOffActive.length > 0 ? (
                        <div style={{ marginTop: 10 }}>
                          <Text size="xs" fw={700}>One-off</Text>
                          {oneOffActive.map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                              <Checkbox
                                checked={item.checked}
                                onChange={e => onCheckItem(list.userId, item.id, e.target.checked)}
                                styles={{ body: { padding: 0 } }}
                                aria-label={item.display_name || item.name}
                              />
                              <ItemLabel text={item.display_name || item.name} />
                              {onToggleNotNeeded ? (
                                <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Not needed">
                                  <IconHexagonMinus size={14} />
                                </ActionIcon>
                              ) : null}
                              {/* Edit for one-off items: open edit drawer in promote mode */}
                              <ActionIcon size="sm" variant="light" onClick={() => {
                                setPromoteContext({ listId: activeListId || '', packingListItemId: item.id });
                                setEditInitialName(item.display_name || item.name);
                                setShowEditDrawer(true);
                              }} aria-label="Edit one-off">
                                <IconEdit size={14} />
                              </ActionIcon>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {(dismissed.length > 0 || oneOffDismissed.length > 0) ? (
                        <div style={{ marginTop: 8 }}>
                          <Text size="xs" c="dimmed">Not needed</Text>
                          {[...dismissed, ...oneOffDismissed].map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', color: '#888' }}>
                              <Checkbox disabled checked={item.checked} onChange={e => onCheckItem(list.userId, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.name} />
                              <ItemLabel text={item.display_name || item.name} />
                              {onToggleNotNeeded ? (
                                <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Move to active">
                                  <IconRotateClockwise size={14} />
                                </ActionIcon>
                              ) : null}
                            </div>
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
