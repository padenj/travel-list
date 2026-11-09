// @vitest-environment jsdom
import { describe as _describe, it as _it, expect as _expect, beforeEach as _beforeEach, beforeAll as _beforeAll, afterEach as _afterEach, vi as _vi } from 'vitest';
import * as api from '../api';

let hasTestingLibs = true;
try {
  require.resolve('@testing-library/react');
  require.resolve('@testing-library/user-event');
} catch (e) {
  hasTestingLibs = false;
}

if (!hasTestingLibs) {
  _describe.skip('Dashboard (component tests skipped - install testing libs)', () => {});
} else {
  if (!(globalThis as any).localStorage) {
    (globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }

  const rtl = require('@testing-library/react');
  const userEvent = require('@testing-library/user-event');
  const React = require('react');
  const { MemoryRouter } = require('react-router-dom');
  const { render, screen, cleanup, fireEvent, waitFor } = rtl;
  const userEventLib = (userEvent && userEvent.default) || userEvent;

  const { describe, it, expect, beforeEach, beforeAll, afterEach, vi } = { describe: _describe, it: _it, expect: _expect, beforeEach: _beforeEach, beforeAll: _beforeAll, afterEach: _afterEach, vi: _vi };

  vi.mock('../api');

  const { requestOpenEdit, openForList, showNotification, activeListState, columnsProps, personViewState, auditProps, addDrawerProps } = vi.hoisted(() => ({
    addDrawerProps: { last: null as any },
    requestOpenEdit: vi.fn(),
    openForList: vi.fn(),
    showNotification: vi.fn(),
    activeListState: { id: 'list-1' as string },
    columnsProps: { last: null as any },
    personViewState: { mode: 'columns' as string, report: null as string | null, props: null as any },
    auditProps: { last: null as any },
  }));

  vi.mock('@mantine/notifications', () => ({ showNotification }));

  vi.mock('../contexts/ActivePackingListContext', () => ({
    useActivePackingList: () => ({
      activeListId: activeListState.id,
      requestOpenEdit,
      availableLists: [
        { id: 'list-1', name: 'Summer Trip' },
        { id: 'list-2', name: 'Winter Trip' },
      ],
    }),
  }));

  vi.mock('../contexts/ListEditDrawerContext', () => ({
    useListEditDrawer: () => ({
      openForList,
    }),
  }));

  vi.mock('../contexts/ImpersonationContext', () => ({
    useImpersonation: () => ({
      impersonatingFamilyId: null,
    }),
  }));

  vi.mock('../components/ActivePackingListSelector', () => ({
    default: () => null,
  }));
  vi.mock('../components/PackingListsSideBySide', () => ({
    PackingListsSideBySide: () => null,
  }));
  vi.mock('../components/ItemEditDrawer', () => ({
    default: () => null,
  }));
  vi.mock('../components/AddItemsDrawer', () => ({
    default: (props: any) => {
      addDrawerProps.last = props;
      return null;
    },
  }));
  vi.mock('../components/PackingListAuditPanel', () => ({
    default: (props: any) => {
      auditProps.last = props;
      return null;
    },
  }));
  vi.mock('../components/PackingListItemAuditModal', () => ({
    default: () => null,
  }));
  vi.mock('../components/PersonView', () => ({
    default: (props: any) => {
      const React = require('react');
      personViewState.props = props;
      React.useEffect(() => {
        if (personViewState.report) props.onSelectedGroupChange?.(personViewState.report);
      }, []);
      return null;
    },
  }));
  vi.mock('../components/DestinationColumns', () => ({
    default: (props: any) => {
      columnsProps.last = props;
      return null;
    },
  }));
  vi.mock('../components/DashboardViewToggle', () => ({
    default: () => null,
    useDashboardViewMode: () => [personViewState.mode, () => {}],
  }));
  vi.mock('../components/NotesDestinationPicker', () => ({ default: () => null }));
  vi.mock('../components/SplitListDialog', () => ({ default: () => null }));

  vi.mock('@mantine/core', () => {
    const React = require('react');
    const passthrough = (el = 'div') => ({ children, ...props }: any) => {
      const allowed = new Set(['children', 'onClick', 'style', 'role', 'aria-label', 'disabled', 'type']);
      const cleanProps: any = {};
      for (const [k, v] of Object.entries(props || {})) {
        if (allowed.has(k)) cleanProps[k] = v;
      }
      return React.createElement(el, cleanProps, children);
    };
    return {
      Container: passthrough('div'),
      Group: passthrough('div'),
      Stack: passthrough('div'),
      Text: passthrough('div'),
      Button: passthrough('button'),
    };
  });

  let Dashboard: any;
  let apiModule: any;
  beforeAll(async () => {
    apiModule = await import('../api');
    const mod = await import('../components/Dashboard');
    Dashboard = mod.default;
  });

  describe('Dashboard', () => {
    beforeEach(() => {
      cleanup();
      vi.clearAllMocks();
      vi.useRealTimers();
      activeListState.id = 'list-1';
      columnsProps.last = null;
      auditProps.last = null;
      personViewState.mode = 'columns';
      personViewState.report = null;
      personViewState.props = null;
      addDrawerProps.last = null;
      (apiModule.getCategories as any).mockResolvedValue({ response: { ok: true }, data: { categories: [] } });
      (apiModule.getCurrentUserProfile as any).mockResolvedValue({
        response: { ok: true },
        data: { user: { id: 'u1' }, family: { id: 'f1', members: [] } },
      });
      (apiModule.getItems as any).mockResolvedValue({
        response: { ok: true },
        data: { items: [] },
      });
      (apiModule.getPackingList as any).mockResolvedValue({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' } },
      });
      (apiModule.updatePackingList as any).mockResolvedValue({
        response: { ok: true },
        data: {},
      });
    });

    afterEach(() => {
      cleanup();
    });

    it('opens list editor with the active list name', async () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      const user = await userEventLib.setup();
      await user.click(screen.getByRole('button', { name: 'Edit list' }));

      expect(requestOpenEdit).toHaveBeenCalledWith('list-1');
      expect(openForList).toHaveBeenCalledWith('list-1', 'Summer Trip');
    });

    it('shows helper text for empty notes in collapsed trip notes panel', async () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      expect(screen.getAllByText('Add reminders for future trips…').length).toBeGreaterThan(0);
    });

    it('does not apply stale notes load response after switching lists', async () => {
      const pendingByList: Record<string, (value: any) => void> = {};
      (apiModule.getPackingList as any).mockImplementation((listId: string) => new Promise(resolve => {
        pendingByList[listId] = resolve;
      }));

      const view = render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(apiModule.getPackingList).toHaveBeenCalledWith('list-1'));

      activeListState.id = 'list-2';
      view.rerender(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(apiModule.getPackingList).toHaveBeenCalledWith('list-2'));

      pendingByList['list-2']({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: 'notes-for-list-2' } },
      });
      await Promise.resolve();
      await Promise.resolve();

      fireEvent.click(await screen.findByRole('button', { name: 'Expand notes' }));
      const textarea = await screen.findByRole('textbox', { name: 'Trip notes editor' });
      expect((textarea as HTMLTextAreaElement).value).toBe('notes-for-list-2');

      pendingByList['list-1']({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: 'stale-notes-for-list-1' } },
      });
      await Promise.resolve();
      await Promise.resolve();

      expect((textarea as HTMLTextAreaElement).value).toBe('notes-for-list-2');
    });

    it('debounces notes save and flushes a single save on blur', async () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Expand notes' }));
      const textarea = await screen.findByRole('textbox', { name: 'Trip notes editor' });
      vi.useFakeTimers();

      fireEvent.change(textarea, { target: { value: 'Pack charger' } });
      expect(apiModule.updatePackingList).not.toHaveBeenCalled();

      vi.advanceTimersByTime(400);
      expect(apiModule.updatePackingList).not.toHaveBeenCalled();

      fireEvent.blur(textarea);
      expect(apiModule.updatePackingList).toHaveBeenCalledTimes(1);
      expect(apiModule.updatePackingList).toHaveBeenCalledWith('list-1', { notes: 'Pack charger' });

      vi.advanceTimersByTime(1000);
      expect(apiModule.updatePackingList).toHaveBeenCalledTimes(1);
    });

    it('ignores stale save responses after switch-away/switch-back for the same list', async () => {
      const pendingByList: Record<string, Array<(value: any) => void>> = {};
      (apiModule.updatePackingList as any).mockImplementation((listId: string) => new Promise(resolve => {
        if (!pendingByList[listId]) pendingByList[listId] = [];
        pendingByList[listId].push(resolve);
      }));

      const view = render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Expand notes' }));
      let textarea = await screen.findByRole('textbox', { name: 'Trip notes editor' });
      fireEvent.change(textarea, { target: { value: 'old-list-first' } });
      fireEvent.blur(textarea);
      fireEvent.change(textarea, { target: { value: 'old-list-second' } });
      fireEvent.blur(textarea);
      expect(apiModule.updatePackingList).toHaveBeenNthCalledWith(1, 'list-1', { notes: 'old-list-first' });
      expect(apiModule.updatePackingList).toHaveBeenNthCalledWith(2, 'list-1', { notes: 'old-list-second' });

      activeListState.id = 'list-2';
      view.rerender(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await Promise.resolve();

      fireEvent.click(await screen.findByRole('button', { name: 'Expand notes' }));
      textarea = await screen.findByRole('textbox', { name: 'Trip notes editor' });
      fireEvent.change(textarea, { target: { value: 'new-list-notes' } });
      fireEvent.blur(textarea);
      expect(apiModule.updatePackingList).toHaveBeenNthCalledWith(3, 'list-2', { notes: 'new-list-notes' });

      activeListState.id = 'list-1';
      view.rerender(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await Promise.resolve();

      fireEvent.click(await screen.findByRole('button', { name: 'Expand notes' }));
      textarea = await screen.findByRole('textbox', { name: 'Trip notes editor' });
      fireEvent.change(textarea, { target: { value: 'switchback-fresh' } });
      fireEvent.blur(textarea);
      expect(apiModule.updatePackingList).toHaveBeenNthCalledWith(4, 'list-1', { notes: 'switchback-fresh' });

      pendingByList['list-1'][2]({ response: { ok: true }, data: {} });
      await Promise.resolve();
      await Promise.resolve();
      pendingByList['list-1'][1]({ response: { ok: true }, data: {} });
      await Promise.resolve();
      await Promise.resolve();
      pendingByList['list-2'][0]({ response: { ok: true }, data: {} });
      await Promise.resolve();
      await Promise.resolve();

      expect((textarea as HTMLTextAreaElement).value).toBe('switchback-fresh');
      fireEvent.blur(textarea);
      expect(apiModule.updatePackingList).toHaveBeenCalledTimes(4);
    });

    it('does not apply older same-list save response when it resolves after newer response', async () => {
      const pendingByList: Record<string, Array<(value: any) => void>> = {};
      (apiModule.updatePackingList as any).mockImplementation((listId: string) => new Promise(resolve => {
        if (!pendingByList[listId]) pendingByList[listId] = [];
        pendingByList[listId].push(resolve);
      }));

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Expand notes' }));
      const textarea = await screen.findByRole('textbox', { name: 'Trip notes editor' });

      fireEvent.change(textarea, { target: { value: 'first-save' } });
      fireEvent.blur(textarea);
      fireEvent.change(textarea, { target: { value: 'second-save' } });
      fireEvent.blur(textarea);

      expect(apiModule.updatePackingList).toHaveBeenNthCalledWith(1, 'list-1', { notes: 'first-save' });
      expect(apiModule.updatePackingList).toHaveBeenNthCalledWith(2, 'list-1', { notes: 'second-save' });

      pendingByList['list-1'][1]({ response: { ok: true }, data: {} });
      await Promise.resolve();
      await Promise.resolve();

      expect((textarea as HTMLTextAreaElement).value).toBe('second-save');

      pendingByList['list-1'][0]({ response: { ok: true }, data: {} });
      await Promise.resolve();
      await Promise.resolve();

      expect((textarea as HTMLTextAreaElement).value).toBe('second-save');
    });
    const tripContext = {
      tripId: 't1',
      tripName: 'Spring Break',
      destinations: [
        { id: 'd1', tripId: 't1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-1', memberIds: [] },
        { id: 'd2', tripId: 't1', name: "Grandma's", color: 'green', position: 1, packingListId: 'list-2', memberIds: [] },
      ],
    };

    it('loads every destination of the trip as a group', async () => {
      (apiModule.getPackingList as any).mockImplementation(() => Promise.resolve({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' }, trip_destination: tripContext },
      }));

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(columnsProps.last?.groups.map((g: any) => g.name)).toEqual(['Paris', "Grandma's"]));
      expect(apiModule.getPackingList).toHaveBeenCalledWith('list-2');
      expect(columnsProps.last.isTrip).toBe(true);
      expect(screen.getByText('Spring Break · 2 destinations')).toBeTruthy();
    });

    it('refreshes when another destination of the trip changes', async () => {
      (apiModule.getPackingList as any).mockImplementation(() => Promise.resolve({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' }, trip_destination: tripContext },
      }));
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(columnsProps.last?.groups).toHaveLength(2));
      const before = (apiModule.getPackingList as any).mock.calls.length;

      window.dispatchEvent(new CustomEvent('server-event', { detail: { type: 'packing_list_changed', listId: 'list-2', data: {} } }));

      await waitFor(() => expect((apiModule.getPackingList as any).mock.calls.length).toBeGreaterThan(before));
    });

    it('offers splitting an ordinary list', async () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      expect(await screen.findByRole('button', { name: 'Split by destination' })).toBeTruthy();
    });

    it('loads the whole trip in destination order when a later destination list is active', async () => {
      activeListState.id = 'list-2';
      (apiModule.getPackingList as any).mockImplementation(() => Promise.resolve({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' }, trip_destination: tripContext },
      }));
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(columnsProps.last?.groups.map((g: any) => g.listId)).toEqual(['list-1', 'list-2']));
      expect(apiModule.getPackingList).toHaveBeenCalledWith('list-1');
      expect(screen.queryByRole('button', { name: 'Split by destination' })).toBeNull();
    });

    it('sends checks to the list of the destination they belong to', async () => {
      (apiModule.getPackingList as any).mockImplementation((listId: string) => Promise.resolve({
        response: { ok: true },
        data: {
          items: [{ id: `pli-${listId}`, item_id: null, display_name: 'Tent', whole_family: true, members: [] }],
          checks: [],
          list: { notes: '' },
          trip_destination: tripContext,
        },
      }));
      (apiModule.togglePackingListItemCheck as any).mockResolvedValue({ response: { ok: true }, data: {} });
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(columnsProps.last?.groups).toHaveLength(2));

      columnsProps.last.onCheckItem('list-2', null, 'pli-list-2', true);

      await waitFor(() => expect(apiModule.togglePackingListItemCheck).toHaveBeenCalledWith('list-2', 'pli-list-2', null, true));
      await waitFor(() => {
        const [paris, grandmas] = columnsProps.last.groups;
        expect(grandmas.wholeFamilyItems[0].checked).toBe(true);
        expect(paris.wholeFamilyItems[0].checked).toBe(false);
      });
    });

    it('disables splitting while offline', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      try {
        render(
          <MemoryRouter>
            <Dashboard />
          </MemoryRouter>
        );
        const button = await screen.findByRole('button', { name: 'Needs a connection' });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByRole('button', { name: 'Split by destination' })).toBeNull();
      } finally {
        delete (navigator as any).onLine;
      }
    });

    it('keeps notes and audit on the person view destination when the active list changes within the trip', async () => {
      personViewState.mode = 'person';
      personViewState.report = 'list-2';
      activeListState.id = 'list-2';
      (apiModule.getPackingList as any).mockImplementation(() => Promise.resolve({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' }, trip_destination: tripContext },
      }));
      const view = render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(auditProps.last?.packingListId).toBe('list-2'));

      activeListState.id = 'list-1';
      view.rerender(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(apiModule.getPackingList).toHaveBeenCalled());
      await Promise.resolve();
      expect(auditProps.last.packingListId).toBe('list-2');

      fireEvent.click(await screen.findByRole('button', { name: 'Edit list' }));
      expect(openForList).toHaveBeenCalledWith('list-2', expect.anything());
    });

    it('passes the family categories to the person view', async () => {
      personViewState.mode = 'person';
      const categories = [{ id: 'c1', name: 'Clothes', position: 1 }];
      (apiModule.getCategories as any).mockResolvedValue({ response: { ok: true }, data: { categories } });
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(personViewState.props?.categories).toEqual(categories));
      expect(apiModule.getCategories).toHaveBeenCalledWith('f1');
    });

    it("offers items other people have when adding for a person, and assigns the added item to them", async () => {
      (apiModule.getPackingList as any).mockResolvedValue({
        response: { ok: true },
        data: {
          items: [
            { id: 'p1', item_id: 'i1', members: [{ id: 'u1', name: 'Me' }], whole_family: 0 },
            { id: 'p2', item_id: 'i2', members: [{ id: 'u2', name: 'You' }], whole_family: 0 },
            { id: 'p3', item_id: 'i3', members: [], whole_family: 1 },
          ],
          checks: [],
          list: { notes: '' },
        },
      });
      (apiModule.addItemToPackingList as any).mockResolvedValue({ response: { ok: true }, data: {} });
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(columnsProps.last?.groups?.[0]?.userLists).toHaveLength(2));

      rtl.act(() => columnsProps.last.onOpenAddDrawer('list-1', 'u1'));
      await waitFor(() => expect(addDrawerProps.last.opened).toBe(true));
      expect([...addDrawerProps.last.excludedItemIds].sort()).toEqual(['i1', 'i3']);

      await rtl.act(() => addDrawerProps.last.onApply(['i2']));
      expect(apiModule.addItemToPackingList).toHaveBeenCalledWith('list-1', 'i2', undefined, undefined, ['u1']);

      rtl.act(() => columnsProps.last.onOpenAddDrawer('list-1', null));
      await waitFor(() => expect(addDrawerProps.last.opened).toBe(true));
      expect(addDrawerProps.last.excludedItemIds).toEqual(['i1', 'i2', 'i3']);
    });

    it('reports a rejected add to the drawer instead of closing it', async () => {
      (apiModule.addItemToPackingList as any).mockResolvedValue({ response: { ok: false, status: 500 }, data: { error: 'boom' } });
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(columnsProps.last?.groups).toHaveLength(1));
      rtl.act(() => columnsProps.last.onOpenAddDrawer('list-1', null));
      await waitFor(() => expect(addDrawerProps.last.opened).toBe(true));

      let error: unknown = null;
      await rtl.act(async () => {
        try { await addDrawerProps.last.onApply(['i2']); } catch (e) { error = e; }
      });
      expect(error).toBeTruthy();
      expect(addDrawerProps.last.opened).toBe(true);
    });
  });
}
