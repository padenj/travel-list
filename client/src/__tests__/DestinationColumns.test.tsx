/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import type { DestinationGroup } from '../utils/dashboardGroups';

const { sideBySideCalls } = vi.hoisted(() => ({ sideBySideCalls: [] as any[] }));
vi.mock('../components/PackingListsSideBySide', () => ({
  PackingListsSideBySide: (props: any) => {
    sideBySideCalls.push(props);
    return <div>{`columns for ${props.activeListId} (${props.wholeTitle})`}</div>;
  },
}));

import DestinationColumns from '../components/DestinationColumns';

const group = (overrides: Partial<DestinationGroup>): DestinationGroup => ({
  destinationId: null, name: '', color: null, listId: 'l1', members: [], userLists: [], wholeFamilyItems: [],
  notNeededByUser: {}, notNeededWhole: [], notes: '', excludedItemIds: [], ...overrides,
});

const handlers = {
  onCheckItem: vi.fn(), onItemNameClick: vi.fn(), onToggleNotNeeded: vi.fn(), onOpenAddDrawer: vi.fn(), onRefresh: vi.fn(),
};

describe('DestinationColumns', () => {
  afterEach(() => {
    cleanup();
    sideBySideCalls.length = 0;
  });

  it('renders a colored band per destination and titles the shared column "Shared"', () => {
    renderWithMantine(
      <DestinationColumns
        isTrip
        currentUserId="dad"
        familyId="f1"
        groups={[
          group({ destinationId: 'd1', name: 'Paris', color: 'blue', listId: 'list-paris', members: [{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }] }),
          group({ destinationId: 'd2', name: "Grandma's", color: 'green', listId: 'list-grandma', members: [{ id: 'ava', name: 'Ava' }] }),
        ]}
        {...handlers}
      />
    );
    expect(screen.getByRole('heading', { name: 'Paris · Dad, Mom' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: "Grandma's · Ava" })).toBeTruthy();
    expect(screen.getByText('columns for list-grandma (Shared)')).toBeTruthy();
  });

  it('routes callbacks with the group list id', () => {
    renderWithMantine(
      <DestinationColumns isTrip currentUserId={null} familyId="f1" groups={[group({ listId: 'list-paris', name: 'Paris' })]} {...handlers} />
    );
    sideBySideCalls[0].onCheckItem('dad', 'p1', true);
    sideBySideCalls[0].onOpenAddDrawer(null);
    expect(handlers.onCheckItem).toHaveBeenCalledWith('list-paris', 'dad', 'p1', true);
    expect(handlers.onOpenAddDrawer).toHaveBeenCalledWith('list-paris', null);
  });

  it('renders an ordinary list without a band', () => {
    renderWithMantine(
      <DestinationColumns isTrip={false} currentUserId={null} familyId="f1" groups={[group({ listId: 'l1', name: 'Beach' })]} {...handlers} />
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('columns for l1 (Whole Family)')).toBeTruthy();
  });

  it('fills the viewport only for a single group', () => {
    const { unmount } = renderWithMantine(
      <DestinationColumns isTrip currentUserId={null} familyId="f1" groups={[group({ listId: 'a' }), group({ listId: 'b' })]} {...handlers} />
    );
    expect(sideBySideCalls.map(c => c.fillViewport)).toEqual([false, false]);
    unmount();
    sideBySideCalls.length = 0;
    renderWithMantine(
      <DestinationColumns isTrip currentUserId={null} familyId="f1" groups={[group({ listId: 'a' })]} {...handlers} />
    );
    expect(sideBySideCalls[0].fillViewport).toBe(true);
  });

  it('styles the band with the light variant and a filled left border', () => {
    renderWithMantine(
      <DestinationColumns isTrip currentUserId={null} familyId="f1" groups={[group({ name: 'Paris', color: 'teal' })]} {...handlers} />
    );
    const h = screen.getByRole('heading', { name: 'Paris' });
    expect(h.style.background).toContain('--mantine-color-teal-light');
    expect(h.style.color).toContain('--mantine-color-teal-light-color');
    expect(h.style.borderLeft).toContain('--mantine-color-teal-filled');
  });
});
