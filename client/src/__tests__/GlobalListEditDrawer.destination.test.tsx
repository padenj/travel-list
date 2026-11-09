import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as api from '../api';
import { tripApi } from '../api/tripApi';
import GlobalListEditDrawer from '../components/GlobalListEditDrawer';

vi.mock('../api');
vi.mock('../api/tripApi', () => ({
  tripApi: { listDestinations: vi.fn(), updateDestination: vi.fn() },
}));

const { showNotification } = vi.hoisted(() => ({ showNotification: vi.fn() }));
vi.mock('@mantine/notifications', () => ({ showNotification }));

vi.mock('../contexts/ListEditDrawerContext', () => ({
  useListEditDrawer: () => ({ isOpen: true, listId: 'list-1', listName: 'Paris', close: vi.fn(), renderFn: null, openForList: vi.fn() }),
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
  (api.getPackingList as any).mockResolvedValue({
    response: { ok: true },
    data: { name: 'Paris', items: [], template_ids: [], list: { member_ids: memberIds }, trip_destination: { tripId: 'trip-1', tripName: 'T', destinations: [] } },
  });
  (api.getCurrentUserProfile as any).mockResolvedValue({
    response: { ok: true },
    data: { family: { id: 'f1', members: [{ id: 'm1', name: 'Ann' }, { id: 'm2', name: 'Bob' }] } },
  });
  (api.getItemGroups as any).mockResolvedValue({ response: { ok: true }, data: { itemGroups: [] } });
  await act(async () => { render(<GlobalListEditDrawer />); });
  await screen.findByLabelText('Bob');
}

const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

async function tick(name: string) {
  await act(async () => { fireEvent.click(box(name)); });
  await act(async () => { await new Promise(r => setTimeout(r, 600)); });
}

describe('GlobalListEditDrawer destination members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
