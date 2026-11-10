import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { tripApi } from '../api/tripApi';

let hasTestingLibs = true;
try {
  require.resolve('@testing-library/react');
  require.resolve('@testing-library/user-event');
} catch (e) {
  hasTestingLibs = false;
}

let availableListsMock: any[] = [];
let refreshListsMock: any;
let impersonatingFamilyIdMock: string | null = null;
const { showNotificationMock } = vi.hoisted(() => ({ showNotificationMock: vi.fn() }));

vi.mock('../api');
vi.mock('../components/AddItemsDrawer', () => {
  const React = require('react');
  return { default: () => React.createElement('div', null) };
});
vi.mock('../components/ItemEditDrawer', () => {
  const React = require('react');
  return { default: () => React.createElement('div', null) };
});
vi.mock('../components/ManageDestinationsDrawer', () => {
  const React = require('react');
  return { default: (props: any) => (props.opened ? React.createElement('div', null, `destinations drawer for ${props.tripId}`) : null) };
});
vi.mock('../api/tripApi', () => ({
  tripApi: { copyTrip: vi.fn(), deleteTrip: vi.fn() },
}));
vi.mock('../contexts/ImpersonationContext', () => ({
  useImpersonation: () => ({ impersonatingFamilyId: impersonatingFamilyIdMock }),
}));
vi.mock('../contexts/ListEditDrawerContext', () => ({
  useListEditDrawer: () => ({ openForList: vi.fn() }),
}));
vi.mock('../contexts/ActivePackingListContext', () => ({
  useActivePackingList: () => ({
    availableLists: availableListsMock,
    refreshLists: refreshListsMock,
    pendingOpenEditId: null,
    clearPendingOpenEdit: vi.fn(),
    requestOpenEdit: vi.fn(),
  }),
}));
vi.mock('@mantine/notifications', () => ({
  showNotification: showNotificationMock,
}));
vi.mock('@mantine/core', () => {
  const React = require('react');
  const passthrough = (el = 'div') => ({ children, ...props }: any) => React.createElement(el, props, children);
  return {
    Card: passthrough('div'),
    Title: passthrough('div'),
    Group: passthrough('div'),
    Button: passthrough('button'),
    Stack: passthrough('div'),
    Text: passthrough('div'),
    Drawer: passthrough('div'),
    TextInput: (props: any) => React.createElement('input', { ...props }),
    Badge: passthrough('div'),
    Checkbox: (props: any) => React.createElement('input', { type: 'checkbox', ...props }),
    ActionIcon: passthrough('button'),
    Tooltip: passthrough('div'),
  };
});

if (!hasTestingLibs) {
  describe.skip('ManagePackingLists', () => {});
} else {
  const rtl = require('@testing-library/react');
  const userEvent = require('@testing-library/user-event');
  const { render, screen, waitFor } = rtl;
  const user = (userEvent && userEvent.default) || userEvent;
  const { MemoryRouter } = require('react-router-dom');
  const React = require('react');

  let ManagePackingLists: any;

  beforeAll(async () => {
    const mod = await import('../components/ManagePackingLists');
    ManagePackingLists = mod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    availableListsMock = [
      { id: 'list1', name: 'Beach' },
      { id: 'list2', name: 'Ski' },
    ];
    impersonatingFamilyIdMock = null;
    refreshListsMock = vi.fn().mockResolvedValue(availableListsMock);

    (api.getCurrentUserProfile as any).mockResolvedValue({
      response: { ok: true },
      data: { family: { id: 'f1', active_packing_list_id: 'list1', members: [] } },
    });
    (api.getItemGroups as any).mockResolvedValue({ response: { ok: true }, data: { itemGroups: [] } });
    (api.getFamily as any).mockResolvedValue({
      response: { ok: true },
      data: { family: { id: 'f1', active_packing_list_id: 'list1', members: [] } },
    });
    (api.setActivePackingList as any).mockResolvedValue({ response: { ok: true }, data: {} });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <ManagePackingLists />
      </MemoryRouter>
    );

  describe('ManagePackingLists active list actions', () => {
    it('shows Active badge for the active row and Set as active for non-active rows', async () => {
      renderPage();

      expect(await screen.findByText('Active')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Set as active' })).toBeTruthy();
    });

    it('uses impersonated family active list for Active badge', async () => {
      impersonatingFamilyIdMock = 'f-imp';
      (api.getFamily as any).mockResolvedValueOnce({
        response: { ok: true },
        data: { family: { id: 'f-imp', active_packing_list_id: 'list2', members: [] } },
      });

      renderPage();

      expect(await screen.findByText('Active')).toBeTruthy();
      expect(api.getFamily).toHaveBeenCalledWith('f-imp');
      expect(screen.getAllByRole('button', { name: 'Set as active' })).toHaveLength(1);
    });

    it('clicking Set as active calls API and refreshes list data', async () => {
      const u = await user.setup();
      renderPage();
      await screen.findByText('Active');

      const baselineRefreshCalls = refreshListsMock.mock.calls.length;
      await u.click(screen.getByRole('button', { name: 'Set as active' }));

      await waitFor(() => expect(api.setActivePackingList).toHaveBeenCalledWith('f1', 'list2'));
      await waitFor(() => expect(refreshListsMock.mock.calls.length).toBeGreaterThan(baselineRefreshCalls));
    });

    it('shows success notification when setting active list succeeds', async () => {
      const u = await user.setup();
      renderPage();
      await screen.findByText('Active');

      await u.click(screen.getByRole('button', { name: 'Set as active' }));

      await waitFor(() =>
        expect(showNotificationMock).toHaveBeenCalledWith({
          title: 'Updated',
          message: 'Active list updated',
          color: 'green',
        })
      );
    });

    it('shows error notification when set active response is not ok', async () => {
      (api.setActivePackingList as any).mockResolvedValueOnce({ response: { ok: false }, data: {} });
      const u = await user.setup();
      renderPage();
      await screen.findByText('Active');

      await u.click(screen.getByRole('button', { name: 'Set as active' }));

      await waitFor(() =>
        expect(showNotificationMock).toHaveBeenCalledWith({
          title: 'Error',
          message: 'Failed to set active list',
          color: 'red',
        })
      );
    });

    it('shows error notification when set active request throws', async () => {
      (api.setActivePackingList as any).mockRejectedValueOnce(new Error('network error'));
      const u = await user.setup();
      renderPage();
      await screen.findByText('Active');

      await u.click(screen.getByRole('button', { name: 'Set as active' }));

      await waitFor(() =>
        expect(showNotificationMock).toHaveBeenCalledWith({
          title: 'Error',
          message: 'Failed to set active list',
          color: 'red',
        })
      );
    });
  });

  describe('ManagePackingLists trip cards', () => {
    const summary = (
      tripId: string,
      tripName: string,
      destinationId: string,
      destinationName: string,
      position: number,
      destinationCount: number,
      color: string,
      tripStartDate: string | null,
      tripEndDate: string | null,
    ) => ({ tripId, tripName, destinationId, destinationName, position, destinationCount, color, tripStartDate, tripEndDate });

    beforeEach(() => {
      // Spring Break is dated far in the future so it always sorts before the dateless Ski trip.
      availableListsMock = [
        { id: 'list2', name: "Spring Break · Grandma's", member_ids: ['ava'], trip_destination: summary('t1', 'Spring Break', 'd2', "Grandma's", 1, 2, 'green', '2099-03-01', '2099-03-08') },
        { id: 'list1', name: 'Spring Break · Paris', member_ids: ['dad'], trip_destination: summary('t1', 'Spring Break', 'd1', 'Paris', 0, 2, 'blue', '2099-03-01', '2099-03-08') },
        { id: 'list3', name: 'Ski', member_ids: [], trip_destination: summary('t2', 'Ski', 'd3', 'Ski', 0, 1, 'blue', null, null) },
      ];
      refreshListsMock = vi.fn().mockResolvedValue(availableListsMock);
      const family = {
        id: 'f1',
        active_packing_list_id: 'list1',
        members: [{ id: 'dad', name: 'Dad' }, { id: 'ava', name: 'Ava' }],
      };
      (api.getCurrentUserProfile as any).mockResolvedValue({ response: { ok: true }, data: { family } });
      (tripApi.copyTrip as any).mockResolvedValue({
        trip: { id: 't9', name: 'Spring Break 2' },
        destinations: [{ id: 'd9', packingListId: 'list9' }],
      });
      (tripApi.deleteTrip as any).mockResolvedValue(undefined);
    });

    it('shows one card per trip with a sub-row per destination', async () => {
      renderPage();
      expect(await screen.findByText('Spring Break · 2 destinations')).toBeTruthy();
      expect(screen.getByText('Ski')).toBeTruthy();
      expect(screen.getByText('Paris')).toBeTruthy();
      expect(screen.getByText("Grandma's")).toBeTruthy();
      expect(await screen.findByText('Dad')).toBeTruthy();
      expect(screen.getByText('Ava')).toBeTruthy();
      await waitFor(() => expect(screen.getAllByText('Active')).toHaveLength(1));
      expect(screen.getAllByRole('button', { name: 'Set as active' })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Edit Paris' })).toBeTruthy();
      expect(screen.getByRole('button', { name: "Edit Grandma's" })).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Split' })).toBeNull();
    });

    it('sets a trip active through its first destination list', async () => {
      const u = await user.setup();
      renderPage();
      await screen.findByText('Spring Break · 2 destinations');
      await u.click(screen.getByRole('button', { name: 'Set as active' }));
      await waitFor(() => expect(api.setActivePackingList).toHaveBeenCalledWith('f1', 'list3'));
    });

    it('opens the destinations drawer for a trip', async () => {
      const u = await user.setup();
      renderPage();
      await screen.findByText('Spring Break · 2 destinations');
      await u.click(screen.getAllByRole('button', { name: 'Destinations' })[0]);
      expect(screen.getByText('destinations drawer for t1')).toBeTruthy();
    });

    it('copies a trip through the server', async () => {
      const u = await user.setup();
      renderPage();
      await screen.findByText('Spring Break · 2 destinations');
      await u.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
      const input = screen.getByDisplayValue('Spring Break (copy)');
      await u.clear(input);
      await u.type(input, 'Spring Break 2');
      await u.click(screen.getByRole('checkbox'));
      await u.click(screen.getByRole('button', { name: 'Create new trip' }));
      await waitFor(() => expect(tripApi.copyTrip).toHaveBeenCalledWith('t1', { name: 'Spring Break 2', includeOneOffs: true }));
      await waitFor(() =>
        expect(showNotificationMock).toHaveBeenCalledWith({ title: 'Created', message: 'Trip copied', color: 'green' })
      );
    });

    it('shows a notification when copying fails', async () => {
      (tripApi.copyTrip as any).mockRejectedValueOnce(new Error('boom'));
      const u = await user.setup();
      renderPage();
      await screen.findByText('Spring Break · 2 destinations');
      await u.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
      await u.click(screen.getByRole('button', { name: 'Create new trip' }));
      await waitFor(() =>
        expect(showNotificationMock).toHaveBeenCalledWith({ title: 'Error', message: 'Failed to copy trip', color: 'red' })
      );
    });

    it('deletes the whole trip after confirming', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      try {
        const u = await user.setup();
        renderPage();
        await screen.findByText('Spring Break · 2 destinations');
        const baselineRefreshCalls = refreshListsMock.mock.calls.length;
        await u.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
        expect(confirmSpy).toHaveBeenCalledWith('Delete Spring Break and its 2 destination lists?');
        await waitFor(() => expect(tripApi.deleteTrip).toHaveBeenCalledWith('t1'));
        await waitFor(() => expect(refreshListsMock.mock.calls.length).toBeGreaterThan(baselineRefreshCalls));
        expect(api.deletePackingList).not.toHaveBeenCalled();
      } finally {
        confirmSpy.mockRestore();
      }
    });

    it('does not delete when the confirmation is cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      try {
        const u = await user.setup();
        renderPage();
        await screen.findByText('Ski');
        await u.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
        expect(confirmSpy).toHaveBeenCalledWith('Delete Ski?');
        expect(tripApi.deleteTrip).not.toHaveBeenCalled();
      } finally {
        confirmSpy.mockRestore();
      }
    });

    it('disables trip actions with "Needs a connection" while offline', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      try {
        renderPage();
        await screen.findByText('Spring Break · 2 destinations');
        const buttons = screen.getAllByRole('button', { name: 'Needs a connection' }) as HTMLButtonElement[];
        expect(buttons).toHaveLength(6);
        buttons.forEach(b => expect(b.disabled).toBe(true));
        expect(screen.queryByRole('button', { name: 'Destinations' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
      } finally {
        delete (navigator as any).onLine;
      }
    });
  });
}
