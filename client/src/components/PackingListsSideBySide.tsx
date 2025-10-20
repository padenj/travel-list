import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, Stack, Checkbox, ScrollArea, ActionIcon } from '@mantine/core';
import { getCategories } from '../api';
import { IconHexagonMinus, IconRotateClockwise, IconPlus, IconEdit, IconArrowsMinimize, IconArrowsMaximize } from '@tabler/icons-react';
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
  // Allow wrapping: remove nowrap/ellipsis so long names wrap to the next line
  <span style={{ fontSize: 13, lineHeight: '1.2', display: 'block', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', flex: '1 1 auto', minWidth: 0 }}>{text}</span>
);

// Fixed column width (px) used for all columns so they render equal widths
const COLUMN_WIDTH = 203;

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
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({});

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
    for (const l of userLists) keys.push(l.userId);
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
    const oneOff = wholeFamilyItems.filter(i => isOneOffItem(i));
    const regular = wholeFamilyItems.filter(i => !isOneOffItem(i));
    const active = regular.filter(i => !notNeeded.has(i.id));
    const dismissed = regular.filter(i => notNeeded.has(i.id));
    const oneOffActive = oneOff.filter(i => !notNeeded.has(i.id));
    const oneOffDismissed = oneOff.filter(i => notNeeded.has(i.id));

    active.forEach(item => wholeContent.push(
      <div key={`wf-active-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
        <Checkbox checked={item.checked} onChange={e => onCheckItem(null, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.name} />
        <ItemLabel text={(item as any).display_name || item.name} />
        {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Not needed"><IconHexagonMinus size={14} /></ActionIcon>) : null}
      </div>
    ));

    if (oneOffActive.length > 0) {
      wholeContent.push(<div key="wf-oneoff-title" style={{ marginTop: 10 }}><Text size="xs" fw={700}>One-off</Text></div>);
      oneOffActive.forEach(item => wholeContent.push(
        <div key={`wf-oneoff-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <Checkbox checked={item.checked} onChange={e => onCheckItem(null, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.name} />
          <ItemLabel text={(item as any).display_name || item.name} />
          {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Not needed"><IconHexagonMinus size={14} /></ActionIcon>) : null}
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
        </div>
      ));
    }

    if (dismissed.length > 0 || oneOffDismissed.length > 0) {
      wholeContent.push(
        <div key="wf-dismissed" style={{ marginTop: 8 }}>
          <Text size="xs" c="dimmed">Not needed</Text>
          {[...dismissed, ...oneOffDismissed].map(item => (
            <div key={`wf-dismissed-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', color: '#888' }}>
              <Checkbox disabled checked={item.checked} onChange={e => onCheckItem(null, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.name} />
              <ItemLabel text={(item as any).display_name || item.name} />
              {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Move to active"><IconRotateClockwise size={14} /></ActionIcon>) : null}
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
    const oneOff = list.items.filter((i: any) => isOneOffItem(i));
    const regular = list.items.filter((i: any) => !isOneOffItem(i));
    const active = regular.filter((i: any) => !notNeeded.has(i.id));
    const dismissed = regular.filter((i: any) => notNeeded.has(i.id));
    const oneOffActive = oneOff.filter((i: any) => !notNeeded.has(i.id));
    const oneOffDismissed = oneOff.filter((i: any) => notNeeded.has(i.id));

    const grouped = new Map<string | null, any[]>();
    for (const it of active) {
      const cid = (it as any).category && (it as any).category.id ? (it as any).category.id : null;
      if (!grouped.has(cid)) grouped.set(cid, []);
      grouped.get(cid)!.push(it);
    }
    for (const cat of categories) {
      const itemsForCat = grouped.get(cat.id) || [];
      if (itemsForCat.length === 0) continue;
      parts.push(
        <div key={`cat-${cat.id}`} style={{ marginTop: 6 }}>
          <Text size="xs" fw={700}>{cat.name}</Text>
          {itemsForCat.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
              <Checkbox checked={item.checked} onChange={e => onCheckItem(list.userId, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.display_name || item.name} />
              <ItemLabel text={item.display_name || item.name} />
              {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Not needed"><IconHexagonMinus size={14} /></ActionIcon>) : null}
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
          {uncats.map((item: any) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
              <Checkbox checked={item.checked} onChange={e => onCheckItem(list.userId, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.display_name || item.name} />
              <ItemLabel text={item.display_name || item.name} />
              {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Not needed"><IconHexagonMinus size={14} /></ActionIcon>) : null}
            </div>
          ))}
        </div>
      );
    }

    if (oneOffActive.length > 0) {
      parts.push(<div key={`oneoff-title-${list.userId}`} style={{ marginTop: 10 }}><Text size="xs" fw={700}>One-off</Text></div>);
      oneOffActive.forEach((item: any) => parts.push(
        <div key={`user-oneoff-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <Checkbox checked={item.checked} onChange={e => onCheckItem(list.userId, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.display_name || item.name} />
          <ItemLabel text={item.display_name || item.name} />
          {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Not needed"><IconHexagonMinus size={14} /></ActionIcon>) : null}
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
        </div>
      ));
    }

    if (dismissed.length > 0 || oneOffDismissed.length > 0) {
      parts.push(
        <div key={`user-dismissed-${list.userId}`} style={{ marginTop: 8 }}>
          <Text size="xs" c="dimmed">Not needed</Text>
          {[...dismissed, ...oneOffDismissed].map((item: any) => (
            <div key={`user-dismissed-item-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', color: '#888' }}>
              <Checkbox disabled checked={item.checked} onChange={e => onCheckItem(list.userId, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.name} />
              <ItemLabel text={item.display_name || item.name} />
              {onToggleNotNeeded ? (<ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Move to active"><IconRotateClockwise size={14} /></ActionIcon>) : null}
            </div>
          ))}
        </div>
      );
    }

    return parts;
  };

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

      {/* Whole Family column first (force left-most) */}
      {showWhole ? renderColumn('whole', 'Whole Family', wholeContent, !!onOpenAddDrawer, () => onOpenAddDrawer && onOpenAddDrawer(null), userLists.length === 0) : null}

      {/* User columns */}
      {userLists.map((list, index) => renderColumn(list.userId, `${list.userName}'s List`, renderUserContent(list), !!onOpenAddDrawer, () => onOpenAddDrawer && onOpenAddDrawer(list.userId), index === userLists.length - 1))}
    </div>
  );
}

// Provide default export while keeping named export compatibility
export default PackingListsSideBySide;
