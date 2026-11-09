/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import PersonView from '../components/PersonView';
import type { DashboardItem, DestinationGroup } from '../utils/dashboardGroups';

const item = (id: string, name: string, checked = false): DashboardItem => ({
  id, name, checked, masterId: id, added_during_packing: false, display_name: null, masterIsOneOff: false,
  category: null, members: [], whole_family: false,
});

const groups = (): DestinationGroup[] => [
  {
    destinationId: 'd1', name: 'Paris', color: 'blue', listId: 'list-paris',
    members: [{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }],
    userLists: [
      { userId: 'dad', userName: 'Dad', items: [item('p1', 'Passport'), item('p2', 'Camera', true)] },
      { userId: 'mom', userName: 'Mom', items: [item('p3', 'Scarf', true)] },
    ],
    wholeFamilyItems: [{ ...item('p4', 'Sunscreen'), whole_family: true }],
    notNeededByUser: {}, notNeededWhole: [], notes: '', excludedItemIds: [],
  },
  {
    destinationId: 'd2', name: "Grandma's", color: 'green', listId: 'list-grandma',
    members: [{ id: 'ava', name: 'Ava' }],
    userLists: [{ userId: 'ava', userName: 'Ava', items: [item('g1', 'Teddy'), item('g2', 'Pajamas')] }],
    wholeFamilyItems: [], notNeededByUser: { ava: ['g2'] }, notNeededWhole: [], notes: '', excludedItemIds: [],
  },
];

const handlers = () => ({
  onCheckItem: vi.fn(), onToggleNotNeeded: vi.fn(), onOpenAddDrawer: vi.fn(), onItemHistory: vi.fn(),
  onMoveSharedItem: vi.fn(), onSelectedGroupChange: vi.fn(),
});

describe('PersonView', () => {
  afterEach(cleanup);

  it('shows chips with remaining counts, current user first', () => {
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="mom" {...handlers()} />);
    const chips = within(screen.getByRole('toolbar', { name: 'Travelers' })).getAllByRole('button');
    expect(chips.map(c => c.textContent)).toEqual(['Mom ✓', 'Dad 1', 'Ava 1']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
  });

  it("shows the selected person's items and their destination's shared items", () => {
    const h = handlers();
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...h} />);
    expect(screen.getByRole('region', { name: 'Dad · Paris' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Paris shared' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Passport' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Camera' })).toBeNull();
    expect(screen.getByText('▸ 1 packed')).toBeTruthy();
    expect(h.onSelectedGroupChange).toHaveBeenCalledWith('list-paris');
  });

  it('expands packed and not-needed items', async () => {
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="ava" {...handlers()} />);
    await userEvent.click(screen.getByText('▸ 1 not needed'));
    expect(screen.getByRole('checkbox', { name: 'Pajamas' })).toBeTruthy();
  });

  it('checks an item for the selected person', async () => {
    const h = handlers();
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...h} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Passport' }));
    expect(h.onCheckItem).toHaveBeenCalledWith('list-paris', 'dad', 'p1', true);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sunscreen' }));
    expect(h.onCheckItem).toHaveBeenCalledWith('list-paris', null, 'p4', true);
  });

  it('offers moving a shared item to the other destination', async () => {
    const h = handlers();
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...h} />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Sunscreen' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: "Move to Grandma's" }));
    expect(h.onMoveSharedItem).toHaveBeenCalledWith('list-paris', 'p4', 'list-grandma');
  });

  it('does not offer moving personal items', async () => {
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...handlers()} />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Passport' }));
    expect(await screen.findByRole('menuitem', { name: 'Not needed' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Move to/ })).toBeNull();
  });

  it('opens the add drawer for the person and for the shared list', async () => {
    const h = handlers();
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...h} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add item to Dad · Paris' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add item to Paris shared' }));
    expect(h.onOpenAddDrawer).toHaveBeenNthCalledWith(1, 'list-paris', 'dad');
    expect(h.onOpenAddDrawer).toHaveBeenNthCalledWith(2, 'list-paris', null);
  });

  it('swipes left to the next person', () => {
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...handlers()} />);
    const area = screen.getByTestId('person-view');
    fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 120, clientY: 110 }] });
    expect(screen.getByRole('region', { name: 'Mom · Paris' })).toBeTruthy();
  });

  it('uses plain titles for an ordinary list', () => {
    const [paris] = groups();
    renderWithMantine(<PersonView groups={[paris]} isTrip={false} currentUserId="dad" {...handlers()} />);
    expect(screen.getByRole('region', { name: 'Dad' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Shared' })).toBeTruthy();
  });

  it('keeps the chip row below the app header', () => {
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...handlers()} />);
    const bar = screen.getByRole('toolbar', { name: 'Travelers' });
    expect(bar.style.top).toBe('var(--app-shell-header-offset, 0px)');
  });

  it('resets expanded packed state when switching person', async () => {
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...handlers()} />);
    await userEvent.click(screen.getByText('▸ 1 packed'));
    expect(screen.getByRole('checkbox', { name: 'Camera' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^Mom/ }));
    expect(screen.getByText('▸ 1 packed')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Scarf' })).toBeNull();
  });

  it('shows shared items of a memberless group', async () => {
    const h = handlers();
    const gs = groups();
    gs[1] = { ...gs[1], members: [], userLists: [], wholeFamilyItems: [{ ...item('g9', 'Board game'), whole_family: true }] };
    renderWithMantine(<PersonView groups={gs} isTrip currentUserId="dad" {...h} />);
    expect(screen.getByRole('region', { name: "Grandma's — shared" })).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Board game' }));
    expect(h.onCheckItem).toHaveBeenCalledWith('list-grandma', null, 'g9', true);
  });

  it('shows shared items when no group has members', () => {
    const gs = groups().map(g => ({ ...g, members: [], userLists: [] }));
    renderWithMantine(<PersonView groups={gs} isTrip currentUserId={null} {...handlers()} />);
    expect(screen.queryByText('No travelers on this list yet.')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Sunscreen' })).toBeTruthy();
  });
});
