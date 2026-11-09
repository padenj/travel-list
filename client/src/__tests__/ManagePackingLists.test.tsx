import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';

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
vi.mock('../components/SplitListDialog', () => {
  const React = require('react');
  return { default: (props: any) => (props.opened ? React.createElement('div', null, `split dialog for ${props.listId}`) : null) };
});
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

  describe('ManagePackingLists trip destinations', () => {
    const trip = (destinationId: string, destinationName: string, position: number) => ({
      tripId: 't1', tripName: 'Spring Break', destinationId, destinationName, position, destinationCount: 2,
    });

    beforeEach(() => {
      availableListsMock = [
        { id: 'list1', name: 'Spring – Paris', trip_destination: trip('d1', 'Paris', 0) },
        { id: 'list2', name: "Spring – Grandma's", trip_destination: trip('d2', "Grandma's", 1) },
        { id: 'list3', name: 'Ski' },
      ];
      refreshListsMock = vi.fn().mockResolvedValue(availableListsMock);
    });

    it('labels destination lists and marks every destination of the active trip as active', async () => {
      renderPage();
      expect(await screen.findByText('Spring Break · Paris')).toBeTruthy();
      expect(screen.getByText("Spring Break · Grandma's")).toBeTruthy();
      await waitFor(() => expect(screen.getAllByText('Active')).toHaveLength(2));
      expect(screen.getAllByRole('button', { name: 'Set as active' })).toHaveLength(1);
    });

    it('offers Split only for lists that are not part of a trip', async () => {
      const u = await user.setup();
      renderPage();
      await screen.findByText('Spring Break · Paris');
      const splitButtons = screen.getAllByRole('button', { name: 'Split' });
      expect(splitButtons).toHaveLength(1);
      await u.click(splitButtons[0]);
      expect(screen.getByText('split dialog for list3')).toBeTruthy();
    });

    it('disables Split with "Needs a connection" while offline', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      try {
        renderPage();
        await screen.findByText('Spring Break · Paris');
        const btn = screen.getByRole('button', { name: 'Needs a connection' }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        expect(screen.queryByRole('button', { name: 'Split' })).toBeNull();
      } finally {
        delete (navigator as any).onLine;
      }
    });
  });
}
