import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Text, Stack, Checkbox, ScrollArea, ActionIcon, useMantineTheme } from '@mantine/core';
import { getCategories } from '../api';
import { IconHexagonMinus, IconRotateClockwise, IconPlus, IconEdit, IconArrowsMinimize, IconArrowsMaximize, IconSparkles } from '@tabler/icons-react';
import ItemEditDrawer from './ItemEditDrawer';

export interface PackingListProps {
  userLists: { userId: string; userName: string; items: { id: string; name: string; checked: boolean; masterId?: string | null; added_during_packing?: boolean; display_name?: string | null; masterIsOneOff?: boolean }[] }[];
  wholeFamilyItems: { id: string; name: string; checked: boolean; masterId?: string | null; added_during_packing?: boolean; display_name?: string | null; masterIsOneOff?: boolean }[];
  onCheckItem: (userId: string | null, itemId: string, checked: boolean) => void;
  onItemNameClick?: (packingListItemId: string, itemName: string) => void;
  notNeededByUser?: Record<string, string[]>;
  notNeededWhole?: string[];
  onToggleNotNeeded?: (userId: string | null, itemId: string) => void;
  onOpenAddDrawer?: (userId: string | null) => void;
  showWhole?: boolean;
  // active list id and family id are needed to edit/remove one-off packing-list items
  activeListId?: string | null;
  familyId?: string | null;
  onRefresh?: () => void;
  currentUserId?: string | null;
}

const ItemLabel: React.FC<{ text: string; checked?: boolean; isOneOff?: boolean; onClick?: () => void }> = ({ text, checked, isOneOff, onClick }) => {
  const theme = useMantineTheme();
  const checkedColor = theme.colors.gray[6];
  return (
    <span style={{ fontSize: 13, lineHeight: '1.2', display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'normal', wordBreak: 'break-word', flex: '1 1 auto', minWidth: 0, color: checked ? checkedColor : undefined }}>
      <span
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (!onClick) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        style={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'break-word', cursor: onClick ? 'pointer' : undefined, textDecoration: onClick ? 'underline' : undefined }}
      >
        {text}
      </span>
      {isOneOff ? <span style={{ flex: '0 0 auto' }}><IconSparkles size={12} style={{ opacity: 0.9 }} /></span> : null}
    </span>
  );
};

// Helper: sort items alphabetically using display_name when present, otherwise name
const sortByName = (a: any, b: any) => {
  const an = (a && (a.display_name || a.name)) || '';
  const bn = (b && (b.display_name || b.name)) || '';
  return String(an).localeCompare(String(bn));
};

const ItemRow: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean; onToggleNotNeeded?: () => void; onEdit?: () => void }> = React.memo(({ checked, onChange, label, disabled, onToggleNotNeeded, onEdit }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', minWidth: 0 }}>
      <Checkbox
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        styles={{ body: { padding: 0 } }}
        aria-label={label}
        disabled={disabled}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <ItemLabel text={label} checked={checked} />
      </div>
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

// Fixed column width (px) used for all columns so they render equal widths
const COLUMN_WIDTH = 203;

export function PackingListsSideBySide({ userLists, wholeFamilyItems, onCheckItem, onItemNameClick, notNeededByUser = {}, notNeededWhole = [], onToggleNotNeeded, onOpenAddDrawer, showWhole = true, activeListId, familyId, onRefresh, currentUserId }: PackingListProps) {

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
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({});

  // Defensive: ensure we always operate on an array even if caller passes undefined
  const safeUserLists = Array.isArray(userLists) ? userLists : [];

  const toggleCollapse = (key: string) => {
    setCollapsedColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Utility: measure text width using canvas. Used to compute how tall a
  // rotated label will be so we can ensure a collapsed-only layout still is
  // tall enough to show the full rotated title.
  const measureText = (text: string, font = '13px system-ui, sans-serif') => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 0;
      ctx.font = font;
      return ctx.measureText(text).width;
    } catch (e) {
      return 0;
    }
  };

  // Determine whether all visible columns are collapsed. If so, we want to
  // ensure the columns area has a minHeight large enough to display the
  // rotated column title without clipping.
  const allCollapsed = useMemo(() => {
    // Consider only columns that are rendered (whole if showWhole)
    const keys: string[] = [];
    if (showWhole) keys.push('whole');
    for (const l of safeUserLists) keys.push(l.userId);
    return keys.length > 0 && keys.every(k => !!collapsedColumns[k]);
  }, [collapsedColumns, userLists, showWhole]);

  // Compute required minHeight (px) to display the longest rotated title
  // when collapsed. Rotated text is measured horizontally then we add padding
  // and small safety margin. This is a best-effort approximation.
  const requiredMinHeight = useMemo(() => {
    const titles: string[] = [];
    if (showWhole) titles.push('Whole Family');
    for (const l of userLists) titles.push(l.userName);
    let maxW = 0;
    for (const t of titles) {
      const w = measureText(t);
      if (w > maxW) maxW = w;
    }
    // Because we rotate -90deg the visible height needed is approx the measured width
    // plus small padding. Clamp to a sensible min value.
    const pad = 12;
    return Math.max(28, Math.ceil(maxW + pad));
  }, [userLists, showWhole]);


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

  // Extract the Whole Family column into a variable so the JSX parser
  // doesn't get confused by nested inline IIFEs and ternaries inside the
  // returned markup. This keeps the return value's children simple.
  // Simplified placeholder while we validate JSX parsing. We'll reintroduce
  // the full detailed rendering once the parser/lint errors are resolved.
  const wholeColumn = showWhole ? (
    collapsedColumns['whole'] ? (
      <div role="button" tabIndex={0} onClick={() => toggleCollapse('whole')} style={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Whole</div>
    ) : (
      <div style={{ minWidth: COLUMN_WIDTH, width: `${COLUMN_WIDTH}px`, padding: 8 }}>Whole Family</div>
    )
  ) : null;
  // Helper that renders a column header and content area. `content` should
  // already be prepared as an array of React nodes.
  const renderColumn = (key: string, title: string, content: React.ReactNode[], canAdd?: boolean, addHandler?: () => void, isLast?: boolean) => {
    if (collapsedColumns[key]) {
      // When collapsed: use writing-mode for vertical text instead of transform.
      // This is more predictable for positioning and won't clip at the top.
      return (
        <div role="button" tabIndex={0} key={`tab-${key}`} onClick={() => toggleCollapse(key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCollapse(key); }} style={{ width: 48, minWidth: 48, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', cursor: 'pointer', borderLeft: '2px solid #e0e0e0', borderRight: isLast ? '2px solid #e0e0e0' : undefined, borderTop: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0', background: '#fafafa', paddingTop: 8, paddingBottom: 8, gap: 8 }} aria-label={`Expand ${title}`}>
          <IconArrowsMaximize size={16} stroke={1.5} style={{ color: '#000', fontWeight: 600 }} />
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', display: 'inline-block', fontSize: 14, lineHeight: 1, whiteSpace: 'nowrap', fontWeight: 600, color: '#000' }}>{title}</span>
        </div>
      );
    }
    return (
      <div key={`col-${key}`} style={{ minWidth: COLUMN_WIDTH, width: `${COLUMN_WIDTH}px`, borderLeft: '2px solid #e0e0e0', borderRight: isLast ? '2px solid #e0e0e0' : undefined, height: availableHeight ? `${availableHeight}px` : '60vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', paddingLeft: 14, background: '#fafafa', marginBottom: 0, borderTop: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ActionIcon size="xs" variant="subtle" onClick={() => toggleCollapse(key)} aria-label={`Collapse ${title} column`} title="Collapse">
              <IconArrowsMinimize size={14} />
            </ActionIcon>
            <Text size="sm" fw={600}>{title}</Text>
          </div>
          {canAdd && addHandler ? (
            <ActionIcon size="sm" variant="light" onClick={addHandler} aria-label={`Add one-off to ${title}`}>
              <IconPlus size={14} />
            </ActionIcon>
          ) : null}
        </div>
        <ScrollArea style={{ flex: 1, padding: '8px 12px', paddingLeft: 14 }}>
          <Stack style={{ gap: 6 }}>
            {content}
          </Stack>
        </ScrollArea>
      </div>
    );
  };

  const wholeContent: React.ReactNode[] = [];
  if (wholeFamilyItems.length === 0) {
    wholeContent.push(<span key="wf-empty" style={{ color: '#888', fontSize: 13 }}>No items assigned</span>);
  } else {
    const notNeeded = new Set(notNeededWhole || []);

    // Group active (not-needed) items by category id
    const grouped = new Map<string | null, any[]>();
    const dismissed: any[] = [];
    for (const it of wholeFamilyItems) {
      if (notNeeded.has(it.id)) {
        dismissed.push(it);
        continue;
      }
      const cid = (it as any).category && (it as any).category.id ? (it as any).category.id : null;
      if (!grouped.has(cid)) grouped.set(cid, []);
      grouped.get(cid)!.push(it);
    }

    // Render categories in configured order
    for (const cat of categories) {
      const itemsForCat = grouped.get(cat.id) || [];
      if (itemsForCat.length === 0) continue;
      wholeContent.push(
        <div key={`cat-${cat.id}`} style={{ marginTop: 6 }}>
          <Text size="xs" fw={700}>{cat.name}</Text>
          {itemsForCat.sort(sortByName).map((item: any) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
              <Checkbox checked={item.checked} onChange={e => onCheckItem(null, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.display_name || item.name} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
                <ItemLabel text={item.display_name || item.name} isOneOff={isOneOffItem(item)} onClick={onItemNameClick ? () => onItemNameClick(item.id, item.display_name || item.name) : undefined} />
              </div>
              <div style={{ display: 'flex', gap: 6, width: 56, flex: '0 0 auto', alignItems: 'center', justifyContent: 'flex-end', zIndex: 3 }}>
                {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Not needed"><IconHexagonMinus size={14} /></ActionIcon>) : null}
                {isOneOffItem(item) ? (
                  <ActionIcon size="sm" variant="light" onClick={() => {
                    const masterIdWhole = (item as any).item_id || (item as any).master_id || (item as any).itemId || (item as any).masterId || null;
                    setPromoteContext({ listId: activeListId || '', packingListItemId: item.id });
                    setEditMasterItemId(masterIdWhole);
                    setEditInitialName(item.display_name || item.name);
                    setEditInitialCategoryId((item as any).category ? (item as any).category.id : undefined);
                    setEditInitialMembers((item as any).members ? (item as any).members.map((m: any) => m.id) : undefined);
                    setEditInitialWhole(!!(item as any).whole_family);
                    setShowEditDrawer(true);
                  }} aria-label="Edit one-off"><IconEdit size={14} /></ActionIcon>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      );
      grouped.delete(cat.id);
    }

    const uncats = grouped.get(null) || [];
    if (uncats.length > 0) {
      wholeContent.push(
        <div key="cat-uncategorized" style={{ marginTop: 6 }}>
          <Text size="xs" fw={700}>Uncategorized</Text>
          {uncats.sort(sortByName).map((item: any) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
              <Checkbox checked={item.checked} onChange={e => onCheckItem(null, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.display_name || item.name} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
                <ItemLabel text={item.display_name || item.name} isOneOff={isOneOffItem(item)} onClick={onItemNameClick ? () => onItemNameClick(item.id, item.display_name || item.name) : undefined} />
              </div>
              <div style={{ display: 'flex', gap: 6, width: 56, flex: '0 0 auto', alignItems: 'center', justifyContent: 'flex-end', zIndex: 3 }}>
                {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Not needed"><IconHexagonMinus size={14} /></ActionIcon>) : null}
                {isOneOffItem(item) ? (
                  <ActionIcon size="sm" variant="light" onClick={() => {
                    const masterIdWhole = (item as any).item_id || (item as any).master_id || (item as any).itemId || (item as any).masterId || null;
                    setPromoteContext({ listId: activeListId || '', packingListItemId: item.id });
                    setEditMasterItemId(masterIdWhole);
                    setEditInitialName(item.display_name || item.name);
                    setEditInitialCategoryId((item as any).category ? (item as any).category.id : undefined);
                    setEditInitialMembers((item as any).members ? (item as any).members.map((m: any) => m.id) : undefined);
                    setEditInitialWhole(!!(item as any).whole_family);
                    setShowEditDrawer(true);
                  }} aria-label="Edit one-off"><IconEdit size={14} /></ActionIcon>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (dismissed.length > 0) {
      wholeContent.push(
        <div key="wf-dismissed" style={{ marginTop: 8 }}>
          <Text size="xs" c="dimmed">Not needed</Text>
          {dismissed.sort(sortByName).map(item => (
            <div key={`wf-dismissed-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', color: '#888' }}>
              <Checkbox disabled checked={item.checked} onChange={e => onCheckItem(null, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.name} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
                <ItemLabel text={(item as any).display_name || item.name} isOneOff={isOneOffItem(item)} onClick={onItemNameClick ? () => onItemNameClick(item.id, (item as any).display_name || item.name) : undefined} />
              </div>
              <div style={{ display: 'flex', gap: 6, width: 56, flex: '0 0 auto', alignItems: 'center', justifyContent: 'flex-end', zIndex: 3 }}>
                {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Move to active"><IconRotateClockwise size={14} /></ActionIcon>) : null}
                {isOneOffItem(item) ? (
                  <ActionIcon size="sm" variant="light" onClick={() => {
                    const masterIdWhole = (item as any).item_id || (item as any).master_id || (item as any).itemId || (item as any).masterId || null;
                    setPromoteContext({ listId: activeListId || '', packingListItemId: item.id });
                    setEditMasterItemId(masterIdWhole);
                    setEditInitialName(item.display_name || item.name);
                    setEditInitialCategoryId((item as any).category ? (item as any).category.id : undefined);
                    setEditInitialMembers((item as any).members ? (item as any).members.map((m: any) => m.id) : undefined);
                    setEditInitialWhole(!!(item as any).whole_family);
                    setShowEditDrawer(true);
                  }} aria-label="Edit one-off"><IconEdit size={14} /></ActionIcon>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      );
    }
  }

  const renderUserContent = (list: any) => {
    const parts: React.ReactNode[] = [];
    if (!list.items || list.items.length === 0) {
      parts.push(<span key={`${list.userId}-empty`} style={{ color: '#888', fontSize: 13 }}>No items assigned</span>);
      return parts;
    }
    const notNeeded = new Set(notNeededByUser[list.userId] || []);
    const activeItems = (list.items || []).filter((i: any) => !notNeeded.has(i.id));
    const dismissedItems = (list.items || []).filter((i: any) => notNeeded.has(i.id));

    const grouped = new Map<string | null, any[]>();
    for (const it of activeItems) {
      const cid = (it as any).category && (it as any).category.id ? (it as any).category.id : null;
      if (!grouped.has(cid)) grouped.set(cid, []);
      grouped.get(cid)!.push(it);
    }

    // Render categories in configured order
    for (const cat of categories) {
      const itemsForCat = grouped.get(cat.id) || [];
      if (itemsForCat.length === 0) continue;
      parts.push(
        <div key={`cat-${cat.id}`} style={{ marginTop: 6 }}>
          <Text size="xs" fw={700}>{cat.name}</Text>
          {itemsForCat.sort(sortByName).map((item: any) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
              <Checkbox checked={item.checked} onChange={e => onCheckItem(list.userId, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.display_name || item.name} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
                <ItemLabel text={item.display_name || item.name} isOneOff={isOneOffItem(item)} onClick={onItemNameClick ? () => onItemNameClick(item.id, item.display_name || item.name) : undefined} />
              </div>
              <div style={{ display: 'flex', gap: 6, width: 56, flex: '0 0 auto', alignItems: 'center', zIndex: 3, justifyContent: 'flex-end' }}>
                {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Not needed"><IconHexagonMinus size={14} /></ActionIcon>) : null}
                {isOneOffItem(item) ? (
                  <ActionIcon size="sm" variant="light" onClick={() => {
                    const masterIdUser = (item as any).item_id || (item as any).master_id || (item as any).itemId || (item as any).masterId || null;
                    setPromoteContext({ listId: activeListId || '', packingListItemId: item.id });
                    setEditMasterItemId(masterIdUser);
                    setEditInitialName(item.display_name || item.name);
                    setEditInitialCategoryId((item as any).category ? (item as any).category.id : undefined);
                    setEditInitialMembers((item as any).members ? (item as any).members.map((m: any) => m.id) : undefined);
                    setEditInitialWhole(!!(item as any).whole_family);
                    setShowEditDrawer(true);
                  }} aria-label="Edit one-off"><IconEdit size={14} /></ActionIcon>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      );
      grouped.delete(cat.id);
    }

    const uncats = grouped.get(null) || [];
    if (uncats.length > 0) {
      parts.push(
        <div key="cat-uncategorized" style={{ marginTop: 6 }}>
          <Text size="xs" fw={700}>Uncategorized</Text>
          {uncats.sort(sortByName).map((item: any) => {
            const oneOff = isOneOffItem(item);
            return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
              <Checkbox checked={item.checked} onChange={e => onCheckItem(list.userId, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.display_name || item.name} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
                <ItemLabel text={item.display_name || item.name} isOneOff={oneOff} onClick={onItemNameClick ? () => onItemNameClick(item.id, item.display_name || item.name) : undefined} />
              </div>
              <div style={{ display: 'flex', gap: 6, width: 56, flex: '0 0 auto', alignItems: 'center', zIndex: 3, justifyContent: 'flex-end' }}>
                {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Not needed"><IconHexagonMinus size={14} /></ActionIcon>) : null}
                {oneOff ? (
                  <ActionIcon size="sm" variant="light" onClick={() => {
                    const masterIdUser = (item as any).item_id || (item as any).master_id || (item as any).itemId || (item as any).masterId || null;
                    setPromoteContext({ listId: activeListId || '', packingListItemId: item.id });
                    setEditMasterItemId(masterIdUser);
                    setEditInitialName(item.display_name || item.name);
                    setEditInitialCategoryId((item as any).category ? (item as any).category.id : undefined);
                    setEditInitialMembers((item as any).members ? (item as any).members.map((m: any) => m.id) : undefined);
                    setEditInitialWhole(!!(item as any).whole_family);
                    setShowEditDrawer(true);
                  }} aria-label="Edit one-off"><IconEdit size={14} /></ActionIcon>
                ) : null}
              </div>
            </div>
            );
          })}
        </div>
      );
    }

    if (dismissedItems.length > 0) {
      parts.push(
        <div key={`user-dismissed-${list.userId}`} style={{ marginTop: 8 }}>
          <Text size="xs" c="dimmed">Not needed</Text>
          {dismissedItems.sort(sortByName).map((item: any) => {
            const oneOff = isOneOffItem(item);
            return (
            <div key={`user-dismissed-item-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', color: '#888' }}>
              <Checkbox disabled checked={item.checked} onChange={e => onCheckItem(list.userId, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.name} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
                <ItemLabel text={item.display_name || item.name} isOneOff={oneOff} onClick={onItemNameClick ? () => onItemNameClick(item.id, item.display_name || item.name) : undefined} />
              </div>
              <div style={{ display: 'flex', gap: 6, width: 56, flex: '0 0 auto', alignItems: 'center', zIndex: 3, justifyContent: 'flex-end' }}>
                {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Move to active"><IconRotateClockwise size={14} /></ActionIcon>) : null}
                {oneOff ? (
                  <ActionIcon size="sm" variant="light" onClick={() => {
                    const masterIdUser = (item as any).item_id || (item as any).master_id || (item as any).itemId || (item as any).masterId || null;
                    setPromoteContext({ listId: activeListId || '', packingListItemId: item.id });
                    setEditMasterItemId(masterIdUser);
                    setEditInitialName(item.display_name || item.name);
                    setEditInitialCategoryId((item as any).category ? (item as any).category.id : undefined);
                    setEditInitialMembers((item as any).members ? (item as any).members.map((m: any) => m.id) : undefined);
                    setEditInitialWhole(!!(item as any).whole_family);
                    setShowEditDrawer(true);
                  }} aria-label="Edit one-off"><IconEdit size={14} /></ActionIcon>
                ) : null}
              </div>
            </div>
            );
          })}
        </div>
      );
    }

    return parts;
  };

  // Reorder user lists: put currentUserId first (if present), then Whole Family, then remaining users in provided order
  const orderedUserLists = (() => {
    if (!currentUserId) return safeUserLists;
    const idx = safeUserLists.findIndex(l => l.userId === currentUserId);
    if (idx === -1) return safeUserLists;
    const copy = safeUserLists.slice();
    const me = copy.splice(idx, 1)[0];
    return [me, ...copy];
  })();

  return (
    <div ref={wrapperRef} style={{ display: 'flex', overflowX: 'auto', gap: 0, alignItems: 'stretch', minHeight: allCollapsed ? `${requiredMinHeight}px` : undefined }}>
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

      {/* Render first user (if any) */}
      {orderedUserLists.length > 0 ? renderColumn(orderedUserLists[0].userId, `${orderedUserLists[0].userName}'s List`, renderUserContent(orderedUserLists[0]), true, () => onOpenAddDrawer && onOpenAddDrawer(orderedUserLists[0].userId)) : null}

      {/* Then Whole Family */}
      {showWhole ? renderColumn('whole', 'Whole Family', wholeContent, true, () => onOpenAddDrawer && onOpenAddDrawer(null)) : null}

      {/* Then remaining users (skip first if already rendered) */}
      {orderedUserLists.slice(1).map((list, i) => renderColumn(list.userId, `${list.userName}'s List`, renderUserContent(list), true, () => onOpenAddDrawer && onOpenAddDrawer(list.userId), i === orderedUserLists.slice(1).length - 1))}
    </div>
  );
}

// Provide default export while keeping named export compatibility
export default PackingListsSideBySide;
