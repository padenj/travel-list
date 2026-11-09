/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine, setMobileViewport } from '../test-utils/renderWithMantine';

vi.mock('../api', () => ({ getItemGroups: vi.fn(), getFamilyPackingLists: vi.fn() }));
vi.mock('../api/tripApi', () => ({
  tripApi: { createDestination: vi.fn(), updateDestination: vi.fn(), listDestinations: vi.fn() },
  ApiConflictError: class ApiConflictError extends Error {
    constructor(message: string, public body: any) { super(message); }
  },
}));
vi.mock('@mantine/notifications', () => ({ showNotification: vi.fn() }));

import { getFamilyPackingLists, getItemGroups } from '../api';
import { tripApi, ApiConflictError } from '../api/tripApi';
import { showNotification } from '@mantine/notifications';
import AddDestinationDialog from '../components/AddDestinationDialog';

const trip = { id: 't1', familyId: 'f1', name: 'Spring Break', startDate: '2027-03-01', endDate: '2027-03-08', createdAt: '', updatedAt: '' };
const familyMembers = [{ id: 'dad', name: 'Dad' }, { id: 'ava', name: 'Ava' }, { id: 'leo', name: 'Leo' }];
const grandma = { id: 'd1', tripId: 't1', name: "Grandma's", color: 'green', position: 0, packingListId: 'l1', memberIds: ['ava', 'leo'] };

const conflict = (memberId: string, destinationId: string) =>
  new (ApiConflictError as any)('member_in_other_destination', { error: 'member_in_other_destination', memberId, destinationId });

describe('AddDestinationDialog', () => {
  beforeEach(() => {
    (getItemGroups as any).mockResolvedValue({ response: { ok: true }, data: { itemGroups: [{ id: 'g1', name: 'Beach' }] } });
    (getFamilyPackingLists as any).mockResolvedValue({ response: { ok: true }, data: { lists: [] } });
    (tripApi.createDestination as any).mockResolvedValue({});
    (tripApi.updateDestination as any).mockResolvedValue({});
    (tripApi.listDestinations as any).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a destination with travelers and item groups', async () => {
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dad' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Beach' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', {
      name: 'Paris', memberIds: ['dad'], itemGroupIds: ['g1'], packingListId: undefined,
    });
  });

  it('moves a traveler out of another destination in one request after confirming', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    (tripApi.listDestinations as any).mockResolvedValue([grandma]);
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: "Ava (at Grandma's)" }));
    expect(confirm).toHaveBeenCalledWith("Move Ava from Grandma's?");
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', expect.objectContaining({ memberIds: ['ava'], moveFrom: true }));
  });

  it('keeps the traveler where they are when the move is not confirmed', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
    );
    const ava = screen.getByRole('checkbox', { name: "Ava (at Grandma's)" }) as HTMLInputElement;
    await userEvent.click(ava);
    expect(ava.checked).toBe(false);
  });

  it('refuses to empty another destination', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([{ ...grandma, memberIds: ['ava'] }]);
    vi.stubGlobal('confirm', vi.fn(() => true));
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[{ ...grandma, memberIds: ['ava'] }]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: "Ava (at Grandma's)" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(showNotification).toHaveBeenCalled());
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
    expect(tripApi.createDestination).not.toHaveBeenCalled();
  });

  it('renames and changes travelers when editing', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([grandma]);
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={grandma} onSaved={onSaved} />
    );
    const name = screen.getByLabelText(/Destination name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Nana');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Leo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).toHaveBeenCalledWith('t1', 'd1', { name: 'Nana', memberIds: ['ava'] });
  });

  it('asks to move a traveler the server says is already elsewhere, then retries with moveFrom', async () => {
    const stale = [{ ...grandma, memberIds: ['leo'] }];
    const fresh = [{ ...grandma, memberIds: ['ava', 'leo'] }];
    (tripApi.listDestinations as any).mockResolvedValueOnce(stale).mockResolvedValue(fresh);
    (tripApi.createDestination as any).mockRejectedValueOnce(conflict('ava', 'd1')).mockResolvedValueOnce({});
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={stale} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ava' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText("Ava is already in Grandma's on this trip. Move them here?")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', expect.not.objectContaining({ moveFrom: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
    expect(tripApi.createDestination).toHaveBeenCalledTimes(2);
    expect(tripApi.createDestination).toHaveBeenLastCalledWith('t1', expect.objectContaining({ memberIds: ['ava'], moveFrom: true }));
  });

  it('explains when the conflicting traveler is the only one at the other destination', async () => {
    (tripApi.listDestinations as any).mockResolvedValueOnce([]).mockResolvedValue([{ ...grandma, memberIds: ['ava'] }]);
    (tripApi.createDestination as any).mockRejectedValueOnce(conflict('ava', 'd1'));
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ava' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Ava is the only person in Grandma's on this trip/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Ava is the only person/)).toBeNull();
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
  });

  it('shows a readable message for server error codes', async () => {
    (tripApi.createDestination as any).mockRejectedValueOnce(new Error('invalid_members'));
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dad' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Only family members can be travelers.',
    })));
  });

  it('opens full screen on phones', async () => {
    setMobileViewport(true);
    try {
      renderWithMantine(
        <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
      );
      const dialog = await screen.findByRole('dialog');
      expect(dialog.closest('[data-full-screen]') || dialog.querySelector('[data-full-screen]') || dialog.hasAttribute('data-full-screen')).toBeTruthy();
    } finally {
      setMobileViewport(false);
    }
  });

  it('disables saving while offline', async () => {
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dad' }));
    act(() => { window.dispatchEvent(new Event('offline')); });
    const btn = await screen.findByRole('button', { name: 'Needs a connection' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(await screen.findByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('uses freshly fetched destinations, not the stale prop, to decide on moveFrom', async () => {
    const beach = { ...grandma, id: 'd2', name: 'Beach', memberIds: ['leo', 'dad'] };
    (tripApi.listDestinations as any).mockResolvedValue([{ ...grandma, memberIds: ['ava'] }, beach]);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dad' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', {
      name: 'Paris', memberIds: ['dad'], itemGroupIds: [], packingListId: undefined, moveFrom: true,
    });
  });

  it('does not send memberIds when only the name changed', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([grandma]);
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={grandma} onSaved={onSaved} />
    );
    const name = screen.getByLabelText(/Destination name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Nana');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).toHaveBeenCalledWith('t1', 'd1', { name: 'Nana' });
  });

  it('changes nothing on the client and reports the error when the create fails', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([grandma]);
    (tripApi.createDestination as any).mockRejectedValueOnce(new Error('boom'));
    vi.stubGlobal('confirm', vi.fn(() => true));
    const onSaved = vi.fn();
    const onChanged = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} onChanged={onChanged} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: "Ava (at Grandma's)" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: "Couldn't save the destination. Please try again.",
    })));
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('sends moveFrom when editing pulls a traveler from another destination', async () => {
    const paris = { id: 'd2', tripId: 't1', name: 'Paris', color: 'blue', position: 1, packingListId: 'l2', memberIds: ['dad'] };
    (tripApi.listDestinations as any).mockResolvedValue([grandma, paris]);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma, paris]} familyMembers={familyMembers} editing={paris} onSaved={onSaved} />
    );
    await userEvent.click(screen.getByRole('checkbox', { name: "Ava (at Grandma's)" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).toHaveBeenCalledTimes(1);
    expect(tripApi.updateDestination).toHaveBeenCalledWith('t1', 'd2', { name: 'Paris', memberIds: ['dad', 'ava'], moveFrom: true });
  });

  it('keeps shared items in the existing destination by default when the trip has one destination', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([grandma]);
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    expect((screen.getByRole('radio', { name: "Keep shared items in Grandma's" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('radio', { name: 'Move to Paris' })).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dad' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', {
      name: 'Paris', memberIds: ['dad'], itemGroupIds: [], packingListId: undefined, sharedItemsTo: 'existing',
    });
  });

  it('moves shared items to the new destination when chosen', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([grandma]);
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    expect(screen.getByRole('radio', { name: 'Move to the new destination' })).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('radio', { name: 'Move to Paris' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dad' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', expect.objectContaining({ sharedItemsTo: 'new' }));
  });

  it('does not ask about shared items when editing or when the trip has several destinations', async () => {
    const beach = { ...grandma, id: 'd2', name: 'Beach', memberIds: ['dad'] };
    const { unmount } = renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma, beach]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
    );
    expect(screen.queryByRole('radio')).toBeNull();
    unmount();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={grandma} onSaved={vi.fn()} />
    );
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('offers lists that are the only destination of another trip as existing lists', async () => {
    (getFamilyPackingLists as any).mockResolvedValue({
      response: { ok: true },
      data: {
        lists: [
          { id: 'solo', name: 'Camping', trip_destination: { tripId: 't7', destinationCount: 1 } },
          { id: 'multi', name: 'Easter · Rome', trip_destination: { tripId: 't8', destinationCount: 2 } },
          { id: 'mine', name: "Spring Break · Grandma's", trip_destination: { tripId: 't1', destinationCount: 1 } },
          { id: 'legacy', name: 'Old list', trip_destination: null },
        ],
      },
    });
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
    );
    await userEvent.click(await screen.findByRole('textbox', { name: 'Use an existing list (optional)' }));
    expect(await screen.findByRole('option', { name: 'Camping' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Old list' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Easter · Rome' })).toBeNull();
    expect(screen.queryByRole('option', { name: "Spring Break · Grandma's" })).toBeNull();
  });

  it('opens the "use an existing list" dropdown above a 3110 modal', async () => {
    (getFamilyPackingLists as any).mockResolvedValue({ response: { ok: true }, data: { lists: [{ id: 'l9', name: 'Spare list' }] } });
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} zIndex={3110} />
    );
    const select = await screen.findByPlaceholderText('Start a new list');
    await userEvent.click(select);
    await screen.findByText('Spare list');
    const dropdown = document.querySelector('.mantine-Select-dropdown') as HTMLElement;
    expect(dropdown).toBeTruthy();
    expect(Number(dropdown.style.zIndex)).toBe(3120);
  });
});
