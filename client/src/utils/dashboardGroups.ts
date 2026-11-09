import type { TripDestination } from '../types/trip';

export interface DashboardItem {
  id: string;
  name: string;
  checked: boolean;
  masterId: string | null;
  added_during_packing: boolean;
  display_name: string | null;
  masterIsOneOff: boolean;
  category: any;
  members: any[];
  whole_family: boolean;
}

export interface DashboardUserList {
  userId: string;
  userName: string;
  items: DashboardItem[];
}

export interface DashboardMember {
  id: string;
  name: string;
}

export interface DestinationGroup {
  destinationId: string | null;
  name: string;
  color: string | null;
  listId: string;
  members: DashboardMember[];
  userLists: DashboardUserList[];
  wholeFamilyItems: DashboardItem[];
  notNeededByUser: Record<string, string[]>;
  notNeededWhole: string[];
  notes: string;
  excludedItemIds: string[];
}

export interface BuildGroupInput {
  listId: string;
  listData: any;
  masterItems: any[];
  familyMembers: any[];
  currentUserId: string | null;
  destination: TripDestination | null;
}

function toItem(pli: any, name: string, checked: boolean): DashboardItem {
  return {
    id: pli.id,
    name,
    checked,
    masterId: pli.item_id || null,
    added_during_packing: !!pli.added_during_packing,
    display_name: pli.display_name || null,
    masterIsOneOff: !!pli.master_is_one_off,
    category: pli.category || null,
    members: pli.members || [],
    whole_family: !!pli.whole_family,
  };
}

export function buildDestinationGroup({ listId, listData, masterItems, familyMembers, currentUserId, destination }: BuildGroupInput): DestinationGroup {
  const listItems: any[] = listData?.items || [];
  const checks: any[] = listData?.checks || [];
  const rawNotes = listData?.list?.notes ?? listData?.notes;
  const listMemberIds: string[] = Array.isArray(listData?.list?.member_ids)
    ? listData.list.member_ids
    : Array.isArray(listData?.member_ids) ? listData.member_ids : [];

  // Without family members (e.g. impersonation races), derive them from the item assignments.
  let members: any[] = familyMembers || [];
  if (members.length === 0) {
    const found = new Map<string, any>();
    for (const pli of listItems) for (const m of pli.members || []) if (m && m.id) found.set(m.id, m);
    members = Array.from(found.values());
  }
  if (listMemberIds.length > 0) {
    const selected = new Set(listMemberIds);
    members = members.filter(m => selected.has(m.id));
  }

  const nameFor = (pli: any) => {
    const master = pli.item_id ? masterItems.find((it: any) => it.id === pli.item_id) : null;
    return pli.display_name || pli.master_name || (master ? master.name : '') || 'Item';
  };

  const userLists = members.map(member => ({
    userId: member.id,
    userName: member.name || member.username,
    items: listItems
      .filter(pli => !pli.whole_family && (pli.members || []).some((m: any) => m.id === member.id))
      .map(pli => {
        const row = checks.find(c => c.packing_list_item_id === pli.id && c.member_id === member.id);
        return toItem(pli, nameFor(pli), !!row?.checked);
      }),
  }));

  // Whole-family checks: the NULL-member row is canonical; fall back to the current user's row.
  const wholeFamilyItems = listItems.filter(pli => pli.whole_family).map(pli => {
    const nullCheck = checks.find(c => c.packing_list_item_id === pli.id && (c.member_id === null || c.member_id === undefined));
    const personalCheck = checks.find(c => c.packing_list_item_id === pli.id && c.member_id === currentUserId);
    return toItem(pli, nameFor(pli), !!(nullCheck ?? personalCheck)?.checked);
  });

  const notNeededByUser: Record<string, string[]> = {};
  for (const r of listData?.not_needed_rows || []) {
    if (!r || !r.packing_list_item_id || !r.member_id || !r.not_needed) continue;
    (notNeededByUser[r.member_id] ||= []).push(r.packing_list_item_id);
  }

  return {
    destinationId: destination?.id ?? null,
    name: destination?.name ?? (listData?.list?.name || ''),
    color: destination?.color ?? null,
    listId,
    members: members.map(m => ({ id: m.id, name: m.name || m.username })),
    userLists,
    wholeFamilyItems,
    notNeededByUser,
    notNeededWhole: listItems.filter(pli => !!pli.not_needed).map(pli => pli.id),
    notes: typeof rawNotes === 'string' ? rawNotes : '',
    excludedItemIds: listItems
      .map(pli => pli.item_id || pli.master_id || pli.itemId || pli.masterId)
      .filter(Boolean)
      .map(String),
  };
}

export function applyCheck(groups: DestinationGroup[], listId: string, userId: string | null, itemId: string, checked: boolean): DestinationGroup[] {
  const setChecked = (items: DashboardItem[]) => items.map(it => (it.id === itemId ? { ...it, checked } : it));
  return groups.map(g => {
    if (g.listId !== listId) return g;
    if (userId) {
      return { ...g, userLists: g.userLists.map(l => (l.userId === userId ? { ...l, items: setChecked(l.items) } : l)) };
    }
    return {
      ...g,
      wholeFamilyItems: setChecked(g.wholeFamilyItems),
      userLists: g.userLists.map(l => (l.items.some(it => it.id === itemId) ? { ...l, items: setChecked(l.items) } : l)),
    };
  });
}

export function isNotNeeded(group: DestinationGroup, userId: string | null, itemId: string): boolean {
  return userId ? (group.notNeededByUser[userId] || []).includes(itemId) : group.notNeededWhole.includes(itemId);
}

export function toggleNotNeededIn(groups: DestinationGroup[], listId: string, userId: string | null, itemId: string): DestinationGroup[] {
  const flip = (ids: string[]) => (ids.includes(itemId) ? ids.filter(id => id !== itemId) : [...ids, itemId]);
  return groups.map(g => {
    if (g.listId !== listId) return g;
    if (userId) return { ...g, notNeededByUser: { ...g.notNeededByUser, [userId]: flip(g.notNeededByUser[userId] || []) } };
    return { ...g, notNeededWhole: flip(g.notNeededWhole) };
  });
}

export interface PersonEntry {
  userId: string;
  userName: string;
  listId: string;
  groupIndex: number;
}

export function orderPeople(groups: DestinationGroup[], currentUserId: string | null): PersonEntry[] {
  const people = groups.flatMap((g, groupIndex) =>
    g.userLists.map(l => ({ userId: l.userId, userName: l.userName, listId: g.listId, groupIndex }))
  );
  const meIndex = people.findIndex(p => p.userId === currentUserId);
  if (meIndex > 0) people.unshift(...people.splice(meIndex, 1));
  return people;
}

export function remainingFor(group: DestinationGroup, userId: string): number {
  const items = group.userLists.find(l => l.userId === userId)?.items || [];
  const notNeeded = group.notNeededByUser[userId] || [];
  return items.filter(it => !it.checked && !notNeeded.includes(it.id)).length;
}

export function partitionItems(items: DashboardItem[], notNeededIds: string[]) {
  return {
    todo: items.filter(it => !it.checked && !notNeededIds.includes(it.id)),
    packed: items.filter(it => it.checked && !notNeededIds.includes(it.id)),
    notNeeded: items.filter(it => notNeededIds.includes(it.id)),
  };
}

export function groupProgress(group: DestinationGroup): { total: number; done: number; percent: number } {
  let total = 0;
  let done = 0;
  for (const l of group.userLists) {
    const notNeeded = group.notNeededByUser[l.userId] || [];
    for (const it of l.items) {
      if (notNeeded.includes(it.id)) continue;
      total++;
      if (it.checked) done++;
    }
  }
  for (const it of group.wholeFamilyItems) {
    if (group.notNeededWhole.includes(it.id)) continue;
    total++;
    if (it.checked) done++;
  }
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
