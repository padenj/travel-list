/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api', () => ({ getPackingList: vi.fn(), getFamily: vi.fn() }));
vi.mock('../api/tripApi', () => ({
  tripApi: { listTrips: vi.fn(), createTrip: vi.fn(), splitList: vi.fn() },
  ApiConflictError: class ApiConflictError extends Error {
    constructor(message: string, public body: any) { super(message); }
  },
}));
vi.mock('@mantine/notifications', () => ({ showNotification: vi.fn() }));

import { getFamily, getPackingList } from '../api';
import { tripApi } from '../api/tripApi';
import SplitListDialog from '../components/SplitListDialog';

const assign = async (person: string, destination: string) => {
  const group = screen.getByRole('group', { name: `Destination for ${person}` });
  await userEvent.click(within(group).getByRole('button', { name: destination }));
};

describe('SplitListDialog', () => {
  beforeEach(() => {
    (getPackingList as any).mockResolvedValue({
      response: { ok: true },
      data: { list: { member_ids: ['dad', 'mom', 'ava'] }, items: [{ id: 'x', whole_family: 1 }, { id: 'y', whole_family: 0 }] },
    });
    (getFamily as any).mockResolvedValue({
      response: { ok: true },
      data: { family: { members: [{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }, { id: 'ava', name: 'Ava' }, { id: 'leo', name: 'Leo' }] } },
    });
    (tripApi.listTrips as any).mockResolvedValue([]);
    (tripApi.createTrip as any).mockResolvedValue({ id: 'trip-1' });
    (tripApi.splitList as any).mockResolvedValue({ destinations: [], skippedCount: 0 });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const open = (onSplit = vi.fn()) =>
    renderWithMantine(<SplitListDialog opened onClose={vi.fn()} familyId="f1" listId="list-1" listName="Spring list" onSplit={onSplit} />);

  const finishTripStep = async () => {
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: '2027-03-01' } });
    fireEvent.change(screen.getByLabelText(/End date/), { target: { value: '2027-03-08' } });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  };

  it('requires dates before leaving the trip step', async () => {
    open();
    expect((screen.getByLabelText(/Trip name/) as HTMLInputElement).value).toBe('Spring list');
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    await finishTripStep();
    expect(await screen.findByText('Who goes where?')).toBeTruthy();
  });

  it('only lists the members of the list and requires everyone to be placed', async () => {
    open();
    await finishTripStep();
    await screen.findByRole('group', { name: 'Destination for Ava' });
    expect(screen.queryByRole('group', { name: 'Destination for Leo' })).toBeNull();

    const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    await assign('Dad', 'Destination 1');
    await assign('Mom', 'Destination 1');
    expect(next().disabled).toBe(true);
    await assign('Ava', 'Destination 1');
    expect(next().disabled).toBe(true);
    await assign('Ava', 'Destination 2');
    expect(next().disabled).toBe(false);
  });

  it('creates the trip and splits the list', async () => {
    const onSplit = vi.fn();
    open(onSplit);
    await finishTripStep();
    await screen.findByRole('group', { name: 'Destination for Ava' });
    const firstName = screen.getByRole('textbox', { name: 'Destination 1 name' });
    await userEvent.clear(firstName);
    await userEvent.type(firstName, 'Paris');
    await assign('Dad', 'Paris');
    await assign('Mom', 'Paris');
    await assign('Ava', 'Destination 2');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Where should the 1 shared items go?')).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'Destination 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Split list' }));

    await waitFor(() => expect(onSplit).toHaveBeenCalled());
    expect(tripApi.createTrip).toHaveBeenCalledWith({ name: 'Spring list', startDate: '2027-03-01', endDate: '2027-03-08' });
    expect(tripApi.splitList).toHaveBeenCalledWith('trip-1', {
      sourceListId: 'list-1',
      destinations: [
        { name: 'Paris', memberIds: ['dad', 'mom'] },
        { name: 'Destination 2', memberIds: ['ava'] },
      ],
      sharedItemsDestinationIndex: 1,
    });
  });
});
