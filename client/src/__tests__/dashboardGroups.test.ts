import { describe, it, expect } from 'vitest';
import {
  buildDestinationGroup, applyCheck, toggleNotNeededIn, isNotNeeded, orderPeople,
  remainingFor, partitionItems, groupProgress, DestinationGroup,
} from '../utils/dashboardGroups';

const family = [
  { id: 'dad', name: 'Dad' },
  { id: 'mom', name: 'Mom' },
  { id: 'ava', name: 'Ava' },
];

const parisData = {
  list: { name: 'Spring – Paris', notes: 'Bring adapters', member_ids: ['dad', 'mom'] },
  items: [
    { id: 'p1', item_id: 'i1', members: [{ id: 'dad' }], whole_family: 0 },
    { id: 'p2', item_id: 'i2', members: [{ id: 'mom' }], whole_family: 0, display_name: 'Mom scarf' },
    { id: 'p3', item_id: 'i3', members: [], whole_family: 1 },
  ],
  checks: [
    { packing_list_item_id: 'p1', member_id: 'dad', checked: 1 },
    { packing_list_item_id: 'p3', member_id: null, checked: 1 },
  ],
  not_needed_rows: [{ packing_list_item_id: 'p2', member_id: 'mom', not_needed: 1 }],
};

const master = [
  { id: 'i1', name: 'Passport' },
  { id: 'i2', name: 'Scarf' },
  { id: 'i3', name: 'Sunscreen' },
];

const paris = () =>
  buildDestinationGroup({
    listId: 'list-paris',
    listData: parisData,
    masterItems: master,
    familyMembers: family,
    currentUserId: 'mom',
    destination: { id: 'd1', tripId: 't1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-paris', memberIds: ['dad', 'mom'] },
  });

const grandma = (): DestinationGroup =>
  buildDestinationGroup({
    listId: 'list-grandma',
    listData: { list: { notes: '', member_ids: ['ava'] }, items: [{ id: 'g1', item_id: 'i9', members: [{ id: 'ava' }], whole_family: 0, master_name: 'Teddy' }], checks: [] },
    masterItems: master,
    familyMembers: family,
    currentUserId: 'mom',
    destination: { id: 'd2', tripId: 't1', name: "Grandma's", color: 'green', position: 1, packingListId: 'list-grandma', memberIds: ['ava'] },
  });

describe('buildDestinationGroup', () => {
  it('builds per-person and shared items for the list members only', () => {
    const g = paris();
    expect(g).toMatchObject({ destinationId: 'd1', name: 'Paris', color: 'blue', listId: 'list-paris', notes: 'Bring adapters' });
    expect(g.members).toEqual([{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }]);
    expect(g.userLists.map(l => [l.userName, l.items.map(i => `${i.name}:${i.checked}`)])).toEqual([
      ['Dad', ['Passport:true']],
      ['Mom', ['Mom scarf:false']],
    ]);
    expect(g.wholeFamilyItems.map(i => `${i.name}:${i.checked}`)).toEqual(['Sunscreen:true']);
    expect(g.notNeededByUser).toEqual({ mom: ['p2'] });
    expect(g.excludedItemIds).toEqual(['i1', 'i2', 'i3']);
  });

  it('describes an ordinary list with no destination', () => {
    const g = buildDestinationGroup({ listId: 'l1', listData: { list: { name: 'Beach' }, items: [], checks: [] }, masterItems: [], familyMembers: family, currentUserId: null, destination: null });
    expect(g).toMatchObject({ destinationId: null, name: 'Beach', color: null, notes: '' });
    expect(g.members).toHaveLength(3);
  });

  it('names a destination group with the plain destination name', () => {
    const destination = { id: 'd1', tripId: 't1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-paris', memberIds: [] };
    const g = buildDestinationGroup({ listId: 'list-paris', listData: parisData, masterItems: master, familyMembers: family, currentUserId: null, destination });
    expect(g.name).toBe('Paris');
  });
});

describe('optimistic helpers', () => {
  it('applyCheck updates only the matching list', () => {
    const [p, g] = applyCheck([paris(), grandma()], 'list-paris', 'mom', 'p2', true);
    expect(p.userLists[1].items[0].checked).toBe(true);
    expect(g).toEqual(grandma());
  });

  it('applyCheck on a shared item updates the shared column', () => {
    const [p] = applyCheck([paris()], 'list-paris', null, 'p3', false);
    expect(p.wholeFamilyItems[0].checked).toBe(false);
  });

  it('toggleNotNeededIn flips per-person and shared state', () => {
    let groups = toggleNotNeededIn([paris()], 'list-paris', 'mom', 'p2');
    expect(isNotNeeded(groups[0], 'mom', 'p2')).toBe(false);
    groups = toggleNotNeededIn(groups, 'list-paris', null, 'p3');
    expect(isNotNeeded(groups[0], null, 'p3')).toBe(true);
  });
});

describe('Person view helpers', () => {
  it('orders people with the current user first, then by group and member order', () => {
    expect(orderPeople([paris(), grandma()], 'mom').map(p => `${p.userName}@${p.listId}`)).toEqual([
      'Mom@list-paris', 'Dad@list-paris', 'Ava@list-grandma',
    ]);
    expect(orderPeople([paris(), grandma()], 'nobody').map(p => p.userName)).toEqual(['Dad', 'Mom', 'Ava']);
  });

  it('counts remaining items, ignoring packed and not-needed ones', () => {
    const g = paris();
    expect(remainingFor(g, 'dad')).toBe(0);
    expect(remainingFor(g, 'mom')).toBe(0);
    expect(remainingFor(grandma(), 'ava')).toBe(1);
  });

  it('partitions items into to-do, packed and not needed', () => {
    const items = paris().userLists[1].items.concat(paris().userLists[0].items);
    const parts = partitionItems(items, ['p2']);
    expect(parts.todo).toEqual([]);
    expect(parts.packed.map(i => i.id)).toEqual(['p1']);
    expect(parts.notNeeded.map(i => i.id)).toEqual(['p2']);
  });

  it('treats a checked item that is also not needed as not needed, not packed', () => {
    const items = [
      { ...paris().userLists[1].items[0], id: 'x1', checked: true },
      { ...paris().userLists[1].items[0], id: 'x2', checked: true },
      { ...paris().userLists[1].items[0], id: 'x3', checked: false },
    ];
    const parts = partitionItems(items, ['x1']);
    expect(parts.notNeeded.map(i => i.id)).toEqual(['x1']);
    expect(parts.packed.map(i => i.id)).toEqual(['x2']);
    expect(parts.todo.map(i => i.id)).toEqual(['x3']);
    expect([...parts.todo, ...parts.packed, ...parts.notNeeded]).toHaveLength(items.length);
  });

  it('reports group progress excluding not-needed items', () => {
    expect(groupProgress(paris())).toEqual({ total: 2, done: 2, percent: 100 });
    expect(groupProgress(grandma())).toEqual({ total: 1, done: 0, percent: 0 });
  });
});

describe('groupItemsByCategory', () => {
  const it2 = (id: string, name: string, category: any) => ({
    id, name, checked: false, masterId: id, added_during_packing: false, display_name: null, masterIsOneOff: false,
    category, members: [], whole_family: false,
  });
  const categories = [{ id: 'c2', name: 'Toiletries', position: 2 }, { id: 'c1', name: 'Clothes', position: 1 }];

  it('groups items in category position order, sorted by name, with Uncategorized last', async () => {
    const { groupItemsByCategory } = await import('../utils/dashboardGroups');
    const sections = groupItemsByCategory([
      it2('a', 'Toothbrush', { id: 'c2' }),
      it2('b', 'Socks', { id: 'c1' }),
      it2('c', 'Pants', { id: 'c1' }),
      it2('d', 'Gift', null),
      it2('e', 'Mystery', { id: 'gone' }),
    ], categories);
    expect(sections.map(s => [s.name, s.items.map(i => i.name)])).toEqual([
      ['Clothes', ['Pants', 'Socks']],
      ['Toiletries', ['Toothbrush']],
      ['Uncategorized', ['Gift', 'Mystery']],
    ]);
  });

  it('returns nothing for no items', async () => {
    const { groupItemsByCategory } = await import('../utils/dashboardGroups');
    expect(groupItemsByCategory([], categories)).toEqual([]);
  });
});

describe('addDrawerExclusions', () => {
  it('excludes every list item for the shared section', async () => {
    const { addDrawerExclusions } = await import('../utils/dashboardGroups');
    expect(addDrawerExclusions(paris(), null)).toEqual(['i1', 'i2', 'i3']);
  });

  it("excludes only the person's own items and shared items for a person", async () => {
    const { addDrawerExclusions } = await import('../utils/dashboardGroups');
    // i2 belongs to Mom only, so Dad can still add it.
    expect(addDrawerExclusions(paris(), 'dad').sort()).toEqual(['i1', 'i3']);
  });
});
