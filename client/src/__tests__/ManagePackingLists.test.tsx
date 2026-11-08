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
}
