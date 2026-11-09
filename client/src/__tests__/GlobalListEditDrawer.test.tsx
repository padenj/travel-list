import { describe as _describe, it as _it, expect as _expect, beforeEach as _beforeEach, beforeAll as _beforeAll, vi as _vi } from 'vitest';
import * as api from '../api';

let hasTestingLibs = true;
try {
  require.resolve('@testing-library/react');
  require.resolve('@testing-library/user-event');
} catch (e) {
  hasTestingLibs = false;
}

if (!hasTestingLibs) {
  _describe.skip('GlobalListEditDrawer (component tests skipped - install testing libs)', () => {});
} else {
  const rtl = require('@testing-library/react');
  const userEvent = require('@testing-library/user-event');
  const React = require('react');

  const { act, fireEvent, render, screen, waitFor } = rtl;
  const userEventLib = (userEvent && userEvent.default) || userEvent;

  const { describe, it, expect, beforeEach, beforeAll, vi } = { describe: _describe, it: _it, expect: _expect, beforeEach: _beforeEach, beforeAll: _beforeAll, vi: _vi };

  vi.mock('../api');

  const { refreshLists, showNotification, closeMock } = vi.hoisted(() => ({
    refreshLists: vi.fn(),
    showNotification: vi.fn(),
    closeMock: vi.fn(),
  }));
  vi.mock('@mantine/notifications', () => ({ showNotification }));

  vi.mock('../contexts/ListEditDrawerContext', () => ({
    useListEditDrawer: () => ({
      isOpen: true,
      listId: 'list-1',
      listName: 'Original list',
      close: closeMock,
      renderFn: null,
      openForList: vi.fn(),
    }),
  }));

  vi.mock('../contexts/ActivePackingListContext', () => ({
    useActivePackingList: () => ({
      pendingOpenEditId: null,
      clearPendingOpenEdit: vi.fn(),
      refreshLists,
    }),
  }));

  vi.mock('../components/ItemEditDrawer', () => ({
    default: () => null,
  }));

  vi.mock('../components/AddItemsDrawer', () => ({
    default: () => null,
  }));

  vi.mock('../api/tripApi', () => ({
    tripApi: { listDestinations: vi.fn(), updateDestination: vi.fn() },
  }));

  vi.mock('../components/ManageDestinationsDrawer', () => ({
    default: ({ opened, tripId, onClose }: any) => (opened
      ? require('react').createElement('div', null,
          `destinations drawer for ${tripId}`,
          require('react').createElement('button', { onClick: onClose }, 'Close destinations'))
      : null),
  }));

  vi.mock('@mantine/core', () => {
    const React = require('react');

    const passthrough = (el = 'div') => ({ children, ...props }: any) => {
      const allowed = new Set([
        'aria-label',
        'children',
        'disabled',
        'id',
        'name',
        'onChange',
        'onClick',
        'onKeyDown',
        'placeholder',
        'role',
        'style',
        'title',
        'type',
        'value',
      ]);
      const cleanProps: any = {};

      for (const [k, v] of Object.entries(props || {})) {
        if (allowed.has(k)) {
          cleanProps[k] = v;
        }
      }

      return React.createElement(el, cleanProps, children);
    };

    return {
      ActionIcon: passthrough('button'),
      Badge: passthrough('div'),
      Button: passthrough('button'),
      Checkbox: (props: any) => React.createElement('input', { type: 'checkbox', ...props }),
      Drawer: ({ children, title }: any) => React.createElement('div', null, React.createElement('h2', null, title), children),
      Group: passthrough('div'),
      Modal: passthrough('div'),
      Text: passthrough('div'),
      TextInput: (props: any) => React.createElement('input', { ...props }),
      Tooltip: passthrough('div'),
    };
  });

  let GlobalListEditDrawer: any;
  let tripApi: any;
  beforeAll(async () => {
    const mod = await import('../components/GlobalListEditDrawer');
    GlobalListEditDrawer = mod.default;
    tripApi = (await import('../api/tripApi')).tripApi;
  });

  describe('GlobalListEditDrawer', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      (api.getPackingList as any).mockResolvedValue({
        response: { ok: true },
        data: {
          name: 'Original list',
          items: [],
          template_ids: [],
          list: { member_ids: [] },
        },
      });
      (api.getCurrentUserProfile as any).mockResolvedValue({
        response: { ok: true },
        data: { family: { id: 'family-1', members: [] } },
      });
      (api.getItemGroups as any).mockResolvedValue({
        response: { ok: true },
        data: { itemGroups: [] },
      });
      (api.updatePackingList as any).mockResolvedValue({
        response: { ok: true },
        data: {},
      });
      refreshLists.mockResolvedValue(undefined);
    });

    it('renames the list from the drawer header', async () => {
      await act(async () => {
        render(React.createElement(GlobalListEditDrawer));
      });

      await waitFor(() => expect(api.getPackingList).toHaveBeenCalledWith('list-1'));
      await screen.findByText('Original list');
      await screen.findByText('No family members');

      const user = await userEventLib.setup();
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Rename list' }));
      });
      await act(async () => {
        await user.clear(screen.getByDisplayValue('Original list'));
        await user.type(screen.getByRole('textbox'), 'Renamed list');
      });
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save list name' }));
      });

      await waitFor(() => {
        expect(api.updatePackingList).toHaveBeenCalledWith('list-1', { name: 'Renamed list' });
      });
      await screen.findByText('Renamed list');
      expect(refreshLists).toHaveBeenCalled();
      expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Renamed',
        message: 'List renamed',
      }));
    });

    it('keeps rename mode open if the initial load finishes after editing starts', async () => {
      let resolvePackingList: ((value: any) => void) | undefined;
      (api.getPackingList as any).mockReturnValueOnce(new Promise((resolve) => {
        resolvePackingList = resolve;
      }));

      await act(async () => {
        render(React.createElement(GlobalListEditDrawer));
      });

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Rename list' }));
      });
      const input = screen.getByRole('textbox');
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Draft name' } });
        resolvePackingList?.({
          response: { ok: true },
          data: {
            name: 'Original list',
            items: [],
            template_ids: [],
            list: { member_ids: [] },
          },
        });
      });

      await waitFor(() => {
        const input = screen.getByRole('textbox') as HTMLInputElement;
        expect(input.value).toBe('Draft name');
      });
      expect(screen.queryByRole('button', { name: 'Rename list' })).toBeNull();
    });
  });

  describe('GlobalListEditDrawer on a destination list', () => {
    let serverName = 'Spring Break · Paris';
    const destination = { id: 'dest-1', tripId: 'trip-1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-1', memberIds: [] };

    beforeEach(() => {
      vi.clearAllMocks();
      serverName = 'Spring Break · Paris';
      (api.getPackingList as any).mockImplementation(() => Promise.resolve({
        response: { ok: true },
        data: {
          items: [],
          template_ids: [],
          list: { name: serverName, member_ids: [] },
          trip_destination: { tripId: 'trip-1', tripName: 'Spring Break', destinations: [destination] },
        },
      }));
      (api.getCurrentUserProfile as any).mockResolvedValue({ response: { ok: true }, data: { family: { id: 'family-1', members: [] } } });
      (api.getItemGroups as any).mockResolvedValue({ response: { ok: true }, data: { itemGroups: [] } });
      tripApi.updateDestination.mockImplementation(async (_t: string, _d: string, payload: any) => {
        serverName = `Spring Break · ${payload.name}`;
        return { ...destination, name: payload.name };
      });
      refreshLists.mockResolvedValue(undefined);
    });

    it('titles the drawer with the label', async () => {
      await act(async () => {
        render(React.createElement(GlobalListEditDrawer));
      });
      expect(await screen.findByRole('heading', { name: 'Spring Break · Paris' })).toBeTruthy();
    });

    it('renames the destination with the pencil', async () => {
      await act(async () => {
        render(React.createElement(GlobalListEditDrawer));
      });
      await screen.findByRole('heading', { name: 'Spring Break · Paris' });
      await screen.findByText('No family members');

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Rename list' }));
      });
      const input = screen.getByDisplayValue('Paris');
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Lyon' } });
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save list name' }));
      });

      await waitFor(() => expect(tripApi.updateDestination).toHaveBeenCalledWith('trip-1', 'dest-1', { name: 'Lyon' }));
      expect(await screen.findByRole('heading', { name: 'Spring Break · Lyon' })).toBeTruthy();
      expect(api.updatePackingList).not.toHaveBeenCalledWith('list-1', expect.objectContaining({ name: expect.anything() }));
      expect(refreshLists).toHaveBeenCalled();
    });

    it('opens the destinations drawer', async () => {
      await act(async () => {
        render(React.createElement(GlobalListEditDrawer));
      });
      await screen.findByText('No family members');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Destinations' }));
      });
      expect(screen.getByText('destinations drawer for trip-1')).toBeTruthy();
    });

    it('closes the edit drawer when the owning destination was deleted from the destinations drawer', async () => {
      await act(async () => {
        render(React.createElement(GlobalListEditDrawer));
      });
      await screen.findByText('No family members');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Destinations' }));
      });
      expect(screen.getByText('destinations drawer for trip-1')).toBeTruthy();

      (api.getPackingList as any).mockResolvedValueOnce({ response: { ok: false, status: 404 }, data: {} });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Close destinations' }));
      });

      await waitFor(() => expect(closeMock).toHaveBeenCalled());
      expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({
        message: 'This list was deleted',
      }));
    });
  });
}
