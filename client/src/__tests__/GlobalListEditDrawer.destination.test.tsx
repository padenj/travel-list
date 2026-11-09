import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as api from '../api';
import { tripApi } from '../api/tripApi';
import GlobalListEditDrawer from '../components/GlobalListEditDrawer';

vi.mock('../api');
vi.mock('../api/tripApi', () => ({
  tripApi: { listDestinations: vi.fn(), updateDestination: vi.fn() },
}));

const { showNotification, current } = vi.hoisted(() => ({ showNotification: vi.fn(), current: { listId: 'list-1' } }));
vi.mock('@mantine/notifications', () => ({ showNotification }));

vi.mock('../contexts/ListEditDrawerContext', () => ({
  useListEditDrawer: () => ({ isOpen: true, listId: current.listId, listName: 'Paris', close: vi.fn(), renderFn: null, openForList: vi.fn() }),
}));
vi.mock('../contexts/ActivePackingListContext', () => ({
  useActivePackingList: () => ({ pendingOpenEditId: null, clearPendingOpenEdit: vi.fn(), refreshLists: vi.fn() }),
}));
vi.mock('../components/ItemEditDrawer', () => ({ default: () => null }));
vi.mock('../components/AddItemsDrawer', () => ({ default: () => null }));

vi.mock('@mantine/core', () => {
  const R = require('react');
  const allowed = new Set(['aria-label', 'children', 'disabled', 'id', 'name', 'onChange', 'onClick', 'onKeyDown', 'placeholder', 'role', 'style', 'title', 'type', 'value']);
  const pt = (el = 'div') => ({ children, ...props }: any) => {
    const clean: any = {};
    for (const [k, v] of Object.entries(props)) if (allowed.has(k)) clean[k] = v;
    return R.createElement(el, clean, children);
  };
  return {
    ActionIcon: pt('button'), Alert: pt('div'), Badge: pt('div'), Button: pt('button'), Drawer: pt('div'), Group: pt('div'),
    Modal: pt('div'), Stack: pt('div'), Text: pt('div'), Tooltip: pt('div'),
    Checkbox: ({ label, ...props }: any) => R.createElement('label', null, R.createElement('input', { type: 'checkbox', checked: props.checked, disabled: props.disabled, onChange: props.onChange }), label),
    TextInput: (props: any) => R.createElement('input', { ...props }),
  };
});

const ok = { response: { ok: true, status: 200 }, data: {} };
const conflict409 = { response: { ok: false, status: 409 }, data: { error: 'member_in_other_destination', memberId: 'm2', destinationId: 'dest-2' } };

async function setup(memberIds: string[] = ['m1']) {
  let utils: any;
  (api.getPackingList as any).mockResolvedValue({
    response: { ok: true },
    data: { name: 'Paris', items: [], template_ids: [], list: { member_ids: memberIds }, trip_destination: { tripId: 'trip-1', tripName: 'T', destinations: [] } },
  });
  (api.getCurrentUserProfile as any).mockResolvedValue({
    response: { ok: true },
    data: { family: { id: 'f1', members: [{ id: 'm1', name: 'Ann' }, { id: 'm2', name: 'Bob' }] } },
  });
  (api.getItemGroups as any).mockResolvedValue({ response: { ok: true }, data: { itemGroups: [] } });
  await act(async () => { utils = render(<GlobalListEditDrawer />); });
  await screen.findByLabelText('Bob');
  await waitFor(() => expect(box('Bob').disabled).toBe(false));
  return utils;
}

const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

async function tick(name: string) {
  await act(async () => { fireEvent.click(box(name)); });
  await act(async () => { await new Promise(r => setTimeout(r, 600)); });
}

describe('GlobalListEditDrawer destination members', () => {
  afterEach(async () => {
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    current.listId = 'list-1';
    (api.updatePackingList as any).mockResolvedValue(ok);
  });

  it('shows the alert and rolls back on a 409', async () => {
    (api.updatePackingList as any).mockResolvedValue(conflict409);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]);
    await setup();
    await tick('Bob');
    expect(await screen.findByText(/Bob is already in Rome/)).toBeTruthy();
    expect(box('Bob').checked).toBe(false);
    expect(box('Ann').checked).toBe(true);
  });

  it('Move updates the other destination then re-saves', async () => {
    (api.updatePackingList as any).mockResolvedValueOnce(conflict409).mockResolvedValue(ok);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]);
    (tripApi.updateDestination as any).mockResolvedValue({});
    await setup();
    await tick('Bob');
    await act(async () => { fireEvent.click(await screen.findByText('Move')); });
    await waitFor(() => expect(tripApi.updateDestination).toHaveBeenCalledWith('trip-1', 'dest-2', { memberIds: ['m3'] }));
    await waitFor(() => expect(api.updatePackingList).toHaveBeenLastCalledWith('list-1', { memberIds: ['m1', 'm2'] }));
    expect(box('Bob').checked).toBe(true);
    expect(screen.queryByText(/already in Rome/)).toBeNull();
  });

  it('only-member conflict offers Got it and no Move', async () => {
    (api.updatePackingList as any).mockResolvedValue(conflict409);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2'] }]);
    await setup();
    await tick('Bob');
    expect(await screen.findByText('Got it')).toBeTruthy();
    expect(screen.queryByText('Move')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByText('Got it')); });
    expect(screen.queryByText('Got it')).toBeNull();
    expect(box('Bob').checked).toBe(false);
  });

  it('rolls back on any non-OK response', async () => {
    (api.updatePackingList as any).mockResolvedValue({ response: { ok: false, status: 500 }, data: {} });
    await setup();
    await tick('Bob');
    expect(box('Bob').checked).toBe(false);
    expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({ message: 'Could not save members' }));
  });

  it('explains a 400 when everyone is unticked on a destination list', async () => {
    (api.updatePackingList as any).mockResolvedValue({ response: { ok: false, status: 400 }, data: { error: 'x' } });
    await setup();
    await tick('Ann');
    expect(box('Ann').checked).toBe(true);
    expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({ message: 'A destination needs at least one person.' }));
  });

  it('disables member checkboxes offline on a destination list', async () => {
    await setup();
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    expect(box('Bob').disabled).toBe(true);
    expect(screen.getByText('Needs a connection')).toBeTruthy();
  });

  const deferred = () => {
    let resolve!: (v: any) => void;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
  };

  it('a late success does not overwrite newer ticks', async () => {
    const a = deferred();
    (api.updatePackingList as any).mockReturnValueOnce(a.promise).mockResolvedValue(ok);
    await setup([]);
    await act(async () => { fireEvent.click(box('Ann')); });
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    expect(api.updatePackingList).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(box('Bob')); });
    await act(async () => { a.resolve(ok); });
    expect(box('Ann').checked).toBe(true);
    expect(box('Bob').checked).toBe(true);
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    expect(api.updatePackingList).toHaveBeenCalledTimes(2);
    expect(api.updatePackingList).toHaveBeenLastCalledWith('list-1', { memberIds: ['m1', 'm2'] });
  });

  it('a late failure after a newer tick does not roll back or alert', async () => {
    const a = deferred();
    (api.updatePackingList as any).mockReturnValueOnce(a.promise).mockResolvedValue(ok);
    await setup([]);
    await act(async () => { fireEvent.click(box('Ann')); });
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    await act(async () => { fireEvent.click(box('Bob')); });
    await act(async () => { a.resolve({ response: { ok: false, status: 500 }, data: {} }); });
    expect(box('Ann').checked).toBe(true);
    expect(box('Bob').checked).toBe(true);
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('disables member checkboxes while a Move PUT is in flight, then keeps the moved member', async () => {
    const put = deferred();
    (api.updatePackingList as any).mockResolvedValueOnce(conflict409).mockReturnValueOnce(put.promise).mockResolvedValue(ok);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]);
    (tripApi.updateDestination as any).mockResolvedValue({});
    await setup();
    await tick('Bob');
    await act(async () => { fireEvent.click(await screen.findByText('Move')); });
    await waitFor(() => expect(api.updatePackingList).toHaveBeenCalledTimes(2));
    expect(box('Ann').disabled).toBe(true);
    expect(box('Bob').disabled).toBe(true);
    await act(async () => { put.resolve(ok); });
    await waitFor(() => expect(box('Ann').disabled).toBe(false));
    expect(api.updatePackingList).toHaveBeenLastCalledWith('list-1', { memberIds: ['m1', 'm2'] });
    expect(box('Bob').checked).toBe(true);
  });

  it('disables member checkboxes while updateDestination is pending, then saves the moved member', async () => {
    const upd = deferred();
    (api.updatePackingList as any).mockResolvedValueOnce(conflict409).mockResolvedValue(ok);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]);
    (tripApi.updateDestination as any).mockReturnValue(upd.promise);
    await setup();
    await tick('Bob');
    await act(async () => { fireEvent.click(await screen.findByText('Move')); });
    expect(box('Ann').disabled).toBe(true);
    expect(box('Bob').disabled).toBe(true);
    await act(async () => { upd.resolve({}); });
    await waitFor(() => expect(api.updatePackingList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(box('Ann').disabled).toBe(false));
    expect(api.updatePackingList).toHaveBeenLastCalledWith('list-1', { memberIds: ['m1', 'm2'] });
    expect(box('Bob').checked).toBe(true);
  });

  it('a stale success does not reset the rollback baseline', async () => {
    const a = deferred();
    (api.updatePackingList as any).mockReturnValueOnce(a.promise).mockResolvedValueOnce(ok)
      .mockResolvedValueOnce({ response: { ok: false, status: 500 }, data: {} });
    await setup([]);
    await tick('Ann');
    await act(async () => { fireEvent.click(box('Bob')); });
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    await act(async () => { a.resolve(ok); });
    await tick('Ann');
    expect(api.updatePackingList).toHaveBeenCalledTimes(3);
    expect(box('Ann').checked).toBe(true);
    expect(box('Bob').checked).toBe(true);
  });

  it('a late 409 from list A does not set a conflict or change list B', async () => {
    const a = deferred();
    (api.updatePackingList as any).mockReturnValueOnce(a.promise).mockResolvedValue(ok);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]);
    const utils = await setup(['m1']);
    await tick('Bob');
    expect(api.updatePackingList).toHaveBeenCalledTimes(1);
    (api.getPackingList as any).mockResolvedValue({
      response: { ok: true },
      data: { name: 'Rome', items: [], template_ids: [], list: { member_ids: ['m2'] }, trip_destination: { tripId: 'trip-1', tripName: 'T', destinations: [] } },
    });
    current.listId = 'list-2';
    await act(async () => { utils.rerender(<GlobalListEditDrawer />); });
    await waitFor(() => expect(box('Bob').checked).toBe(true));
    await waitFor(() => expect(box('Bob').disabled).toBe(false));
    expect(box('Ann').checked).toBe(false);
    await act(async () => { a.resolve(conflict409); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(screen.queryByText(/already in Rome/)).toBeNull();
    expect(screen.queryByText('Move')).toBeNull();
    expect(box('Bob').checked).toBe(true);
    expect(box('Ann').checked).toBe(false);
  });

  async function switchToB(utils: any) {
    (api.getPackingList as any).mockResolvedValue({
      response: { ok: true },
      data: { name: 'Rome', items: [], template_ids: [], list: { member_ids: ['m2'] }, trip_destination: { tripId: 'trip-1', tripName: 'T', destinations: [] } },
    });
    current.listId = 'list-2';
    await act(async () => { utils.rerender(<GlobalListEditDrawer />); });
    await waitFor(() => expect(box('Bob').checked).toBe(true));
    await waitFor(() => expect(box('Bob').disabled).toBe(false));
    expect(box('Ann').checked).toBe(false);
  }

  async function expectUntouchedB() {
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(showNotification).not.toHaveBeenCalled();
    expect(screen.queryByText(/already in Rome/)).toBeNull();
    expect(screen.queryByText('Move')).toBeNull();
    expect(box('Bob').checked).toBe(true);
    expect(box('Ann').checked).toBe(false);
    expect(box('Bob').disabled).toBe(false);
    expect(box('Ann').disabled).toBe(false);
  }

  it('a Move still loading destinations when the list switches does not touch list B', async () => {
    const d = deferred();
    (api.updatePackingList as any).mockResolvedValueOnce(conflict409).mockResolvedValue(ok);
    (tripApi.listDestinations as any)
      .mockResolvedValueOnce([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }])
      .mockReturnValueOnce(d.promise);
    (tripApi.updateDestination as any).mockResolvedValue({});
    const utils = await setup(['m1']);
    await tick('Bob');
    await act(async () => { fireEvent.click(await screen.findByText('Move')); });
    await switchToB(utils);
    await act(async () => { d.resolve([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]); });
    await waitFor(() => expect(api.updatePackingList).toHaveBeenCalledWith('list-1', { memberIds: ['m1', 'm2'] }));
    await expectUntouchedB();
  });

  it('a Move whose PUT is in flight when the list switches does not touch list B', async () => {
    const put = deferred();
    (api.updatePackingList as any).mockResolvedValueOnce(conflict409).mockReturnValueOnce(put.promise).mockResolvedValue(ok);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]);
    (tripApi.updateDestination as any).mockResolvedValue({});
    const utils = await setup(['m1']);
    await tick('Bob');
    await act(async () => { fireEvent.click(await screen.findByText('Move')); });
    await waitFor(() => expect(api.updatePackingList).toHaveBeenLastCalledWith('list-1', { memberIds: ['m1', 'm2'] }));
    await switchToB(utils);
    await act(async () => { put.resolve(ok); });
    await expectUntouchedB();
  });
  it('a Move in flight across A -> B -> A does not clobber the new A session', async () => {
    const d = deferred();
    (api.updatePackingList as any).mockResolvedValueOnce(conflict409).mockResolvedValue(ok);
    (tripApi.listDestinations as any)
      .mockResolvedValueOnce([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }])
      .mockReturnValueOnce(d.promise);
    (tripApi.updateDestination as any).mockResolvedValue({});
    const utils = await setup(['m1']);
    await tick('Bob');
    await act(async () => { fireEvent.click(await screen.findByText('Move')); });
    await switchToB(utils);
    (api.getPackingList as any).mockResolvedValue({
      response: { ok: true },
      data: { name: 'Paris', items: [], template_ids: [], list: { member_ids: ['m1'] }, trip_destination: { tripId: 'trip-1', tripName: 'T', destinations: [] } },
    });
    current.listId = 'list-1';
    await act(async () => { utils.rerender(<GlobalListEditDrawer />); });
    await waitFor(() => expect(box('Ann').checked).toBe(true));
    await waitFor(() => expect(box('Ann').disabled).toBe(false));
    await tick('Ann');
    expect(box('Ann').checked).toBe(false);
    await act(async () => { d.resolve([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(box('Ann').checked).toBe(false);
    expect(box('Bob').checked).toBe(false);
    expect(showNotification).not.toHaveBeenCalled();
    expect(screen.queryByText('Move')).toBeNull();
  });

  async function startMoveThenSwitch(utils: any, destGate: any) {
    (tripApi.updateDestination as any).mockReturnValueOnce(destGate.promise);
    await tick('Bob');
    await act(async () => { fireEvent.click(await screen.findByText('Move')); });
    await waitFor(() => expect(tripApi.updateDestination).toHaveBeenCalled());
    await switchToB(utils);
  }

  it('a Move whose updateDestination resolves after a switch, then PUT 409s, leaves B untouched', async () => {
    const gate = deferred();
    (api.updatePackingList as any).mockResolvedValueOnce(conflict409).mockResolvedValueOnce(conflict409).mockResolvedValue(ok);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]);
    const utils = await setup(['m1']);
    await startMoveThenSwitch(utils, gate);
    await act(async () => { gate.resolve({}); });
    await waitFor(() => expect(api.updatePackingList).toHaveBeenCalledTimes(2));
    await expectUntouchedB();
  });

  it('a Move PUT that succeeds after a switch does not change B, and B rolls back to its own members', async () => {
    const gate = deferred();
    (api.updatePackingList as any).mockResolvedValueOnce(conflict409).mockResolvedValueOnce(ok);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]);
    const utils = await setup(['m1']);
    await startMoveThenSwitch(utils, gate);
    await act(async () => { gate.resolve({}); });
    await waitFor(() => expect(api.updatePackingList).toHaveBeenCalledTimes(2));
    await expectUntouchedB();
    (api.updatePackingList as any).mockResolvedValue({ response: { ok: false, status: 500 }, data: {} });
    await tick('Ann');
    await waitFor(() => expect(showNotification).toHaveBeenCalled());
    expect(box('Bob').checked).toBe(true);
    expect(box('Ann').checked).toBe(false);
  });

  const listData = (name: string, memberIds: string[]) => ({
    response: { ok: true },
    data: { name, items: [], template_ids: [], list: { member_ids: memberIds }, trip_destination: { tripId: 'trip-1', tripName: 'T', destinations: [] } },
  });
  const mockFamily = () => {
    (api.getCurrentUserProfile as any).mockResolvedValue({
      response: { ok: true },
      data: { family: { id: 'f1', members: [{ id: 'm1', name: 'Ann' }, { id: 'm2', name: 'Bob' }] } },
    });
    (api.getItemGroups as any).mockResolvedValue({ response: { ok: true }, data: { itemGroups: [] } });
  };

  it('a slow load of A does not overwrite B', async () => {
    const loadA = deferred();
    mockFamily();
    (api.getPackingList as any).mockImplementation((id: string) => (id === 'list-1' ? loadA.promise : Promise.resolve(listData('Rome', ['m2']))));
    let utils: any;
    await act(async () => { utils = render(<GlobalListEditDrawer />); });
    current.listId = 'list-2';
    await act(async () => { utils.rerender(<GlobalListEditDrawer />); });
    await waitFor(() => expect(box('Bob').checked).toBe(true));
    await waitFor(() => expect(box('Bob').disabled).toBe(false));
    await act(async () => { loadA.resolve(listData('Paris', ['m1'])); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(box('Bob').checked).toBe(true);
    expect(box('Ann').checked).toBe(false);
    expect(box('Bob').disabled).toBe(false);
  });

  it('reopening A clears a stale conflict and disables Move while loading', async () => {
    (api.updatePackingList as any).mockResolvedValue(conflict409);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]);
    const utils = await setup(['m1']);
    await tick('Bob');
    expect(await screen.findByText(/Bob is already in Rome/)).toBeTruthy();
    current.listId = null as any;
    await act(async () => { utils.rerender(<GlobalListEditDrawer />); });
    const reload = deferred();
    (api.getPackingList as any).mockReturnValue(reload.promise);
    current.listId = 'list-1';
    await act(async () => { utils.rerender(<GlobalListEditDrawer />); });
    expect(screen.queryByText(/already in Rome/)).toBeNull();
    expect(screen.queryByText('Move')).toBeNull();
    expect(box('Ann').disabled).toBe(true);
    expect(box('Bob').disabled).toBe(true);
    await act(async () => { reload.resolve(listData('Paris', ['m1'])); });
    await waitFor(() => expect(box('Ann').disabled).toBe(false));
  });

  it('a reload of A waits for the flushed save of A', async () => {
    const put = deferred();
    const utils = await setup(['m1']);
    (api.updatePackingList as any).mockReturnValueOnce(put.promise);
    await act(async () => { fireEvent.click(box('Bob')); });
    (api.getPackingList as any).mockImplementation((id: string) => Promise.resolve(listData(id === 'list-1' ? 'Paris' : 'Rome', id === 'list-1' ? ['m1', 'm2'] : ['m2'])));
    current.listId = 'list-2';
    await act(async () => { utils.rerender(<GlobalListEditDrawer />); });
    expect(api.updatePackingList).toHaveBeenCalledWith('list-1', { memberIds: ['m1', 'm2'] });
    await waitFor(() => expect(api.getPackingList).toHaveBeenCalledWith('list-2'));
    (api.getPackingList as any).mockClear();
    current.listId = 'list-1';
    await act(async () => { utils.rerender(<GlobalListEditDrawer />); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(api.getPackingList).not.toHaveBeenCalledWith('list-1');
    await act(async () => { put.resolve(ok); });
    await waitFor(() => expect(api.getPackingList).toHaveBeenCalledWith('list-1'));
  });

  it('closing within the debounce window still sends the PUT for the old list', async () => {
    const utils = await setup(['m1']);
    await act(async () => { fireEvent.click(box('Bob')); });
    expect(api.updatePackingList).not.toHaveBeenCalled();
    current.listId = null as any;
    await act(async () => { utils.rerender(<GlobalListEditDrawer />); });
    expect(api.updatePackingList).toHaveBeenCalledTimes(1);
    expect(api.updatePackingList).toHaveBeenCalledWith('list-1', { memberIds: ['m1', 'm2'] });
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    expect(api.updatePackingList).toHaveBeenCalledTimes(1);
  });
});
