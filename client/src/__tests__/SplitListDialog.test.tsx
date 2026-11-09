/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api', () => ({ getPackingList: vi.fn(), getFamily: vi.fn() }));
vi.mock('../api/tripApi', () => ({
  tripApi: { listTrips: vi.fn(), createTrip: vi.fn(), splitList: vi.fn(), listDestinations: vi.fn(), updateDestination: vi.fn(), updateTrip: vi.fn() },
  ApiConflictError: class ApiConflictError extends Error {
    constructor(message: string, public body: any) { super(message); }
  },
}));
vi.mock('@mantine/notifications', () => ({ showNotification: vi.fn() }));

import { getFamily, getPackingList } from '../api';
import { tripApi, ApiConflictError } from '../api/tripApi';
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

  const toStep3 = async () => {
    await finishTripStep();
    await screen.findByRole('group', { name: 'Destination for Ava' });
    await assign('Dad', 'Destination 1');
    await assign('Mom', 'Destination 1');
    await assign('Ava', 'Destination 2');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  };

  it('reuses the created trip when a split is retried', async () => {
    (tripApi.splitList as any).mockRejectedValueOnce(new Error('boom'));
    open();
    await toStep3();
    await userEvent.click(screen.getByRole('button', { name: 'Split list' }));
    await screen.findByText("Couldn't split the list. Please try again.");
    await userEvent.click(screen.getByRole('button', { name: 'Split list' }));
    await waitFor(() => expect(tripApi.splitList).toHaveBeenCalledTimes(2));
    expect(tripApi.createTrip).toHaveBeenCalledTimes(1);
  });

  it('shows readable text for known server codes', async () => {
    (tripApi.splitList as any).mockRejectedValueOnce(new Error('unassigned_member'));
    open();
    await toStep3();
    await userEvent.click(screen.getByRole('button', { name: 'Split list' }));
    expect(await screen.findByText('Everyone on the list needs a destination.')).toBeTruthy();
  });

  it('asks to move a person who is already in another destination, then retries', async () => {
    (getPackingList as any).mockResolvedValue({ response: { ok: true }, data: { list: { member_ids: ['dad', 'mom', 'ava'] }, items: [] } });
    (tripApi.listTrips as any).mockResolvedValue([{ id: 't9', name: 'Existing' }]);
    (tripApi.splitList as any)
      .mockRejectedValueOnce(new ApiConflictError('c', { error: 'member_in_other_destination', memberId: 'ava', destinationId: 'd1' }))
      .mockResolvedValueOnce({ destinations: [], skippedCount: 0 });
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'd1', name: 'Rome', memberIds: ['ava', 'leo'] }]);
    (tripApi.updateDestination as any).mockResolvedValue({});
    open();
    await userEvent.click(await screen.findByText('Existing trip'));
    await userEvent.click(screen.getByRole('textbox', { name: 'Trip' }));
    await userEvent.click(await screen.findByText('Existing'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('group', { name: 'Destination for Ava' });
    await assign('Dad', 'Destination 1');
    await assign('Mom', 'Destination 1');
    await assign('Ava', 'Destination 2');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Split list' }));
    expect(await screen.findByText('Ava is already in Rome on this trip. Move them here?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(tripApi.splitList).toHaveBeenCalledTimes(2));
    expect(tripApi.updateDestination).toHaveBeenCalledWith('t9', 'd1', { memberIds: ['leo'] });
    expect(tripApi.createTrip).not.toHaveBeenCalled();
  });

  it('does not offer Move when the person is the only member of the other destination', async () => {
    (tripApi.listTrips as any).mockResolvedValue([{ id: 't9', name: 'Existing' }]);
    (tripApi.splitList as any).mockRejectedValueOnce(new ApiConflictError('c', { error: 'member_in_other_destination', memberId: 'ava', destinationId: 'd1' }));
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'd1', name: 'Rome', memberIds: ['ava'] }]);
    open();
    await userEvent.click(await screen.findByText('Existing trip'));
    await userEvent.click(screen.getByRole('textbox', { name: 'Trip' }));
    await userEvent.click(await screen.findByText('Existing'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('group', { name: 'Destination for Ava' });
    await assign('Dad', 'Destination 1');
    await assign('Mom', 'Destination 1');
    await assign('Ava', 'Destination 2');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Split list' }));
    expect(await screen.findByText('Ava is the only person in Rome on this trip. Remove that destination on the trip page first, or choose a different destination for Ava.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/is the only person/)).toBeNull();
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
  });

  it('updates the created trip when details change after a failed split', async () => {
    (tripApi.splitList as any).mockRejectedValueOnce(new Error('boom'));
    (tripApi.updateTrip as any).mockResolvedValue({ id: 'trip-1' });
    open();
    await toStep3();
    await userEvent.click(screen.getByRole('button', { name: 'Split list' }));
    await screen.findByText("Couldn't split the list. Please try again.");
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    const name = screen.getByLabelText(/Trip name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Summer');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Split list' }));
    await waitFor(() => expect(tripApi.splitList).toHaveBeenCalledTimes(2));
    expect(tripApi.updateTrip).toHaveBeenCalledWith('trip-1', { name: 'Summer', startDate: '2027-03-01', endDate: '2027-03-08' });
    expect(tripApi.createTrip).toHaveBeenCalledTimes(1);
    expect((tripApi.splitList as any).mock.calls[1][0]).toBe('trip-1');
  });

  it('can cancel the move prompt', async () => {
    (tripApi.listTrips as any).mockResolvedValue([{ id: 't9', name: 'Existing' }]);
    (tripApi.splitList as any).mockRejectedValueOnce(new ApiConflictError('c', { error: 'member_in_other_destination', memberId: 'ava', destinationId: 'd1' }));
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'd1', name: 'Rome', memberIds: ['ava', 'leo'] }]);
    open();
    await userEvent.click(await screen.findByText('Existing trip'));
    await userEvent.click(screen.getByRole('textbox', { name: 'Trip' }));
    await userEvent.click(await screen.findByText('Existing'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('group', { name: 'Destination for Ava' });
    await assign('Dad', 'Destination 1');
    await assign('Mom', 'Destination 1');
    await assign('Ava', 'Destination 2');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Split list' }));
    await screen.findByRole('button', { name: 'Move' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
  });

  it('recovers after adding and removing a third destination', async () => {
    open();
    await finishTripStep();
    await screen.findByRole('group', { name: 'Destination for Ava' });
    await assign('Dad', 'Destination 1');
    await assign('Mom', 'Destination 1');
    await assign('Ava', 'Destination 2');
    await userEvent.click(screen.getByRole('button', { name: '+ Add destination' }));
    const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(next().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Remove Destination 1' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Destination 3' }));
    expect(next().disabled).toBe(false);
  });

  it('shows an error and blocks Next when the list fails to load', async () => {
    (getPackingList as any).mockResolvedValue({ response: { ok: false }, data: {} });
    open();
    expect(await screen.findByText(/Could not load the list/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: '2027-03-01' } });
    fireEvent.change(screen.getByLabelText(/End date/), { target: { value: '2027-03-08' } });
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables Split when the browser goes offline', async () => {
    open();
    await toStep3();
    act(() => { window.dispatchEvent(new Event('offline')); });
    const btn = await screen.findByRole('button', { name: 'Needs a connection' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    act(() => { window.dispatchEvent(new Event('online')); });
  });
});
