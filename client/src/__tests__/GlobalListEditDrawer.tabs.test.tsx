/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import * as api from '../api';
import { tripApi } from '../api/tripApi';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import GlobalListEditDrawer from '../components/GlobalListEditDrawer';

vi.mock('../api');
vi.mock('../api/tripApi', () => ({
  tripApi: { listDestinations: vi.fn(), updateDestination: vi.fn() },
}));

const { showNotification, current, openForList } = vi.hoisted(() => ({
  showNotification: vi.fn(),
  current: { listId: 'list-b' as string | null, listName: 'Cabo · Beach' },
  openForList: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({ showNotification }));

vi.mock('../contexts/ListEditDrawerContext', () => ({
  useListEditDrawer: () => ({ isOpen: true, listId: current.listId, listName: current.listName, close: vi.fn(), renderFn: null, openForList }),
}));
vi.mock('../contexts/ActivePackingListContext', () => ({
  useActivePackingList: () => ({ pendingOpenEditId: null, clearPendingOpenEdit: vi.fn(), refreshLists: vi.fn() }),
}));
vi.mock('../components/ItemEditDrawer', () => ({ default: () => null }));
vi.mock('../components/AddItemsDrawer', () => ({ default: () => null }));
vi.mock('../components/ManageDestinationsDrawer', () => ({ default: () => null }));

const destinations = [
  { id: 'd-c', tripId: 'trip-1', name: 'Town', color: 'grape', position: 2, packingListId: 'list-c', memberIds: ['m3'] },
  { id: 'd-a', tripId: 'trip-1', name: 'Cabo', color: 'blue', position: 0, packingListId: 'list-a', memberIds: ['m1'] },
  { id: 'd-b', tripId: 'trip-1', name: 'Beach', color: 'teal', position: 1, packingListId: 'list-b', memberIds: ['m2'] },
];

function listResponse(tripDestination: any, memberIds: string[] = ['m2']) {
  return {
    response: { ok: true, status: 200 },
    data: { name: 'Cabo · Beach', items: [], template_ids: [], list: { name: 'Cabo · Beach', member_ids: memberIds }, trip_destination: tripDestination },
  };
}

const trip = (dests: any[]) => ({ tripId: 'trip-1', tripName: 'Cabo', destinations: dests });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

async function renderDrawer() {
  let utils: any;
  await act(async () => { utils = renderWithMantine(<GlobalListEditDrawer />); });
  return utils;
}

const rerender = async (utils: any) => {
  await act(async () => { utils.rerender(<MantineProvider env="test"><GlobalListEditDrawer /></MantineProvider>); });
};

describe('GlobalListEditDrawer destination tabs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    current.listId = 'list-b';
    current.listName = 'Cabo · Beach';
    (api.getCurrentUserProfile as any).mockResolvedValue({
      response: { ok: true },
      data: { family: { id: 'f1', members: [{ id: 'm1', name: 'Ann' }, { id: 'm2', name: 'Bob' }, { id: 'm3', name: 'Cy' }] } },
    });
    (api.getItemGroups as any).mockResolvedValue({ response: { ok: true }, data: { itemGroups: [] } });
    (api.updatePackingList as any).mockResolvedValue({ response: { ok: true, status: 200 }, data: {} });
  });

  afterEach(async () => {
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    cleanup();
  });

  it('shows no tabs for an ordinary list', async () => {
    (api.getPackingList as any).mockResolvedValue(listResponse(null));
    await renderDrawer();
    await screen.findByLabelText('Bob');
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('shows no tabs for a trip with one destination', async () => {
    (api.getPackingList as any).mockResolvedValue(listResponse(trip([destinations[2]])));
    await renderDrawer();
    await screen.findByLabelText('Bob');
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('shows one tab per destination in position order with the current list selected', async () => {
    (api.getPackingList as any).mockResolvedValue(listResponse(trip(destinations)));
    await renderDrawer();
    const tablist = await screen.findByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['Cabo', 'Beach', 'Town']);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    await waitFor(() => expect((tabs[0] as HTMLButtonElement).disabled).toBe(false));
  });

  it('switching tabs opens that destination list through openForList with its label', async () => {
    (api.getPackingList as any).mockResolvedValue(listResponse(trip(destinations)));
    await renderDrawer();
    const tab = await screen.findByRole('tab', { name: 'Town' });
    await waitFor(() => expect((tab as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(tab); });
    expect(openForList).toHaveBeenCalledWith('list-c', 'Cabo · Town');
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Cabo' })); });
    expect(openForList).toHaveBeenLastCalledWith('list-a', 'Cabo');
  });

  it('clicking the selected tab does nothing', async () => {
    (api.getPackingList as any).mockResolvedValue(listResponse(trip(destinations)));
    await renderDrawer();
    const tab = await screen.findByRole('tab', { name: 'Beach' });
    await waitFor(() => expect((tab as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(tab); });
    expect(openForList).not.toHaveBeenCalled();
  });

  it('disables the tabs while the next list loads', async () => {
    (api.getPackingList as any).mockResolvedValue(listResponse(trip(destinations)));
    const utils = await renderDrawer();
    await waitFor(() => expect((screen.getByRole('tab', { name: 'Town' }) as HTMLButtonElement).disabled).toBe(false));

    const pending = deferred<any>();
    (api.getPackingList as any).mockReturnValue(pending.promise);
    current.listId = 'list-c';
    current.listName = 'Cabo · Town';
    await rerender(utils);
    const tabs = screen.getAllByRole('tab') as HTMLButtonElement[];
    expect(tabs.every(t => t.disabled)).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Cabo' })); });
    expect(openForList).not.toHaveBeenCalled();

    await act(async () => { pending.resolve(listResponse(trip(destinations), ['m3'])); });
    await waitFor(() => expect((screen.getByRole('tab', { name: 'Cabo' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole('tab', { name: 'Town' }).getAttribute('aria-selected')).toBe('true');
  });

  it('drops the tabs when the next list is not part of the trip', async () => {
    (api.getPackingList as any).mockResolvedValue(listResponse(trip(destinations)));
    const utils = await renderDrawer();
    await screen.findByRole('tablist');
    (api.getPackingList as any).mockResolvedValue(listResponse(null));
    current.listId = 'other';
    current.listName = 'Other';
    await rerender(utils);
    expect(screen.queryByRole('tablist')).toBeNull();
    await screen.findByLabelText('Bob');
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('disables the tabs while a rename is saving', async () => {
    (api.getPackingList as any).mockResolvedValue(listResponse(trip(destinations)));
    const pending = deferred<any>();
    (tripApi.updateDestination as any).mockReturnValue(pending.promise);
    await renderDrawer();
    await waitFor(() => expect((screen.getByRole('tab', { name: 'Town' }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(screen.getByLabelText('Rename list')); });
    fireEvent.change(screen.getByLabelText('List name'), { target: { value: 'Shore' } });
    await act(async () => { fireEvent.click(screen.getByLabelText('Save list name')); });
    expect((screen.getByRole('tab', { name: 'Town' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { pending.resolve({}); });
    await waitFor(() => expect((screen.getByRole('tab', { name: 'Town' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('disables the tabs while a member Move is in flight', async () => {
    (api.getPackingList as any).mockResolvedValue(listResponse(trip(destinations)));
    (api.updatePackingList as any).mockResolvedValueOnce({
      response: { ok: false, status: 409 },
      data: { error: 'member_in_other_destination', memberId: 'm1', destinationId: 'd-a' },
    });
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'd-a', name: 'Cabo', memberIds: ['m1', 'm9'] }]);
    const pending = deferred<any>();
    (tripApi.updateDestination as any).mockReturnValue(pending.promise);
    await renderDrawer();
    await waitFor(() => expect((screen.getByLabelText('Ann') as HTMLInputElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(screen.getByLabelText('Ann')); });
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    const move = await screen.findByRole('button', { name: 'Move' });
    await act(async () => { fireEvent.click(move); });
    expect((screen.getByRole('tab', { name: 'Town' }) as HTMLButtonElement).disabled).toBe(true);
    (api.updatePackingList as any).mockResolvedValue({ response: { ok: true, status: 200 }, data: {} });
    await act(async () => { pending.resolve({}); });
    await waitFor(() => expect((screen.getByRole('tab', { name: 'Town' }) as HTMLButtonElement).disabled).toBe(false));
  });
});
