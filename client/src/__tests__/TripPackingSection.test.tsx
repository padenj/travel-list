/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithMantine } from '../test-utils/renderWithMantine';

const { setActiveListId } = vi.hoisted(() => ({ setActiveListId: vi.fn() }));

vi.mock('../api', () => ({ getFamily: vi.fn(), getPackingList: vi.fn() }));
vi.mock('../api/tripApi', () => ({
  tripApi: { listDestinations: vi.fn(), deleteDestination: vi.fn() },
  ApiConflictError: class ApiConflictError extends Error {
    constructor(message: string, public body: any) { super(message); }
  },
}));
vi.mock('../contexts/ActivePackingListContext', () => ({ useActivePackingList: () => ({ setActiveListId }) }));
vi.mock('../components/AddDestinationDialog', () => ({
  default: ({ opened, editing }: any) => (opened ? <div>{editing ? `editing ${editing.name}` : 'adding destination'}</div> : null),
}));
vi.mock('@mantine/notifications', () => ({ showNotification: vi.fn() }));

import { getFamily, getPackingList } from '../api';
import { tripApi, ApiConflictError } from '../api/tripApi';
import { showNotification } from '@mantine/notifications';
import TripPackingSection from '../components/TripPackingSection';

const trip = { id: 't1', familyId: 'f1', name: 'Spring Break', startDate: '2027-03-01', endDate: '2027-03-08', createdAt: '', updatedAt: '' };
const paris = { id: 'd1', tripId: 't1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-paris', memberIds: ['dad', 'mom'] };
const grandma = { id: 'd2', tripId: 't1', name: "Grandma's", color: 'green', position: 1, packingListId: 'list-grandma', memberIds: ['ava'] };

const renderSection = () =>
  renderWithMantine(
    <MemoryRouter initialEntries={['/trips/t1']}>
      <Routes>
        <Route path="/trips/t1" element={<TripPackingSection trip={trip} />} />
        <Route path="/" element={<div>dashboard page</div>} />
      </Routes>
    </MemoryRouter>
  );

const openMenu = async (name: string) => {
  await userEvent.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
};

describe('TripPackingSection', () => {
  beforeEach(() => {
    (getFamily as any).mockResolvedValue({
      response: { ok: true },
      data: { family: { members: [{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }, { id: 'ava', name: 'Ava' }] } },
    });
    (getPackingList as any).mockResolvedValue({
      response: { ok: true },
      data: {
        list: { member_ids: ['dad', 'mom'] },
        items: [
          { id: 'p1', item_id: 'i1', members: [{ id: 'dad' }], whole_family: 0 },
          { id: 'p2', item_id: 'i2', members: [], whole_family: 1 },
        ],
        checks: [{ packing_list_item_id: 'p1', member_id: 'dad', checked: 1 }],
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers to set up packing when the trip has no destinations', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([]);
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Set up packing' }));
    expect(screen.getByText('adding destination')).toBeTruthy();
  });

  it('shows a card per destination with travelers and progress', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([paris]);
    renderSection();
    expect(await screen.findByText('Paris')).toBeTruthy();
    expect(screen.getByText('Dad, Mom')).toBeTruthy();
    expect(screen.getByText('2 items · 50% packed')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add destination' })).toBeTruthy();
  });

  it('opens the dashboard on the destination list when a card is tapped', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([paris]);
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Paris packing list' }));
    expect(setActiveListId).toHaveBeenCalledWith('list-paris');
    expect(screen.getByText('dashboard page')).toBeTruthy();
  });

  it('tells the opener when a list is opened', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([paris]);
    const onOpenList = vi.fn();
    renderWithMantine(
      <MemoryRouter initialEntries={['/trips/t1']}>
        <Routes>
          <Route path="/trips/t1" element={<TripPackingSection trip={trip} onOpenList={onOpenList} />} />
          <Route path="/" element={<div>dashboard page</div>} />
        </Routes>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open Paris packing list' }));
    expect(onOpenList).toHaveBeenCalled();
  });

  it('opens the edit dialog from Rename and Change members', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([paris]);
    renderSection();
    await openMenu('Paris');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(screen.getByText('editing Paris')).toBeTruthy();
  });

  it('deletes an empty destination and reloads', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    (tripApi.listDestinations as any).mockResolvedValueOnce([paris]).mockResolvedValueOnce([]);
    (tripApi.deleteDestination as any).mockResolvedValue(undefined);
    renderSection();
    await openMenu('Paris');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(tripApi.deleteDestination).toHaveBeenCalledWith('t1', 'd1', {});
    expect(await screen.findByRole('button', { name: 'Set up packing' })).toBeTruthy();
  });

  it('offers to move shared items or delete the list when the destination has items', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    (tripApi.listDestinations as any).mockResolvedValue([paris, grandma]);
    (tripApi.deleteDestination as any)
      .mockRejectedValueOnce(new (ApiConflictError as any)('destination_has_items', { error: 'destination_has_items', itemCount: 4 }))
      .mockResolvedValueOnce(undefined);
    renderSection();
    await openMenu('Paris');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(await screen.findByText('Paris still has 4 items')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete list too' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: "Move shared items to Grandma's and delete" }));

    await waitFor(() => expect(tripApi.deleteDestination).toHaveBeenLastCalledWith('t1', 'd1', { moveSharedItemsTo: 'd2' }));
    await waitFor(() => expect(screen.queryByText('Paris still has 4 items')).toBeNull());
  });

  it('does not delete when the confirm is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    (tripApi.listDestinations as any).mockResolvedValue([paris]);
    renderSection();
    await openMenu('Paris');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(tripApi.deleteDestination).not.toHaveBeenCalled();
  });

  it('shows a readable error when deleting fails', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    (tripApi.listDestinations as any).mockResolvedValue([paris]);
    (tripApi.deleteDestination as any).mockRejectedValueOnce(new Error('Destination not found'));
    renderSection();
    await openMenu('Paris');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'That destination no longer exists. Refresh and try again.',
    })));
  });

  it('disables destination changes while offline but still opens lists', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([paris]);
    renderSection();
    await screen.findByText('Paris');
    act(() => { window.dispatchEvent(new Event('offline')); });
    try {
      const add = await screen.findByRole('button', { name: 'Needs a connection' });
      expect((add as HTMLButtonElement).disabled).toBe(true);
      await openMenu('Paris');
      for (const name of ['Rename', 'Change members', 'Delete']) {
        const item = await screen.findByRole('menuitem', { name });
        expect(item.hasAttribute('disabled') || item.getAttribute('data-disabled') === 'true').toBe(true);
      }
      expect(screen.getAllByText('Needs a connection').length).toBeGreaterThan(1);
      expect((screen.getByRole('button', { name: 'Open Paris packing list' }) as HTMLButtonElement).disabled).toBe(false);
    } finally {
      act(() => { window.dispatchEvent(new Event('online')); });
    }
  });
});
