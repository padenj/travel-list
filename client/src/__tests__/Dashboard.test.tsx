// @vitest-environment jsdom
import { describe as _describe, it as _it, expect as _expect, beforeEach as _beforeEach, beforeAll as _beforeAll, afterEach as _afterEach, vi as _vi } from 'vitest';

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
  const { render, screen, cleanup, fireEvent } = rtl;
  const userEventLib = (userEvent && userEvent.default) || userEvent;

  const { describe, it, expect, beforeEach, beforeAll, afterEach, vi } = { describe: _describe, it: _it, expect: _expect, beforeEach: _beforeEach, beforeAll: _beforeAll, afterEach: _afterEach, vi: _vi };

  _vi.mock('../api');

  const { requestOpenEdit, openForList, showNotification, activeListState } = _vi.hoisted(() => ({
    requestOpenEdit: _vi.fn(),
    openForList: _vi.fn(),
    showNotification: _vi.fn(),
    activeListState: { id: 'list-1' as string },
  }));

  _vi.mock('@mantine/notifications', () => ({ showNotification }));

  _vi.mock('../contexts/ActivePackingListContext', () => ({
    useActivePackingList: () => ({
      activeListId: activeListState.id,
      requestOpenEdit,
      availableLists: [
        { id: 'list-1', name: 'Summer Trip' },
        { id: 'list-2', name: 'Winter Trip' },
      ],
    }),
  }));

  _vi.mock('../contexts/ListEditDrawerContext', () => ({
    useListEditDrawer: () => ({
      openForList,
    }),
  }));

  _vi.mock('../contexts/ImpersonationContext', () => ({
    useImpersonation: () => ({
      impersonatingFamilyId: null,
    }),
  }));

  _vi.mock('../components/ActivePackingListSelector', () => ({
    default: () => null,
  }));
  _vi.mock('../components/PackingListsSideBySide', () => ({
    PackingListsSideBySide: () => null,
  }));
  _vi.mock('../components/ItemEditDrawer', () => ({
    default: () => null,
  }));
  _vi.mock('../components/AddItemsDrawer', () => ({
    default: () => null,
  }));
  _vi.mock('../components/PackingListAuditPanel', () => ({
    default: () => null,
  }));
  _vi.mock('../components/PackingListItemAuditModal', () => ({
    default: () => null,
  }));

  _vi.mock('@mantine/core', () => {
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
  let api: any;
  beforeAll(async () => {
    api = await import('../api');
    const mod = await import('../components/Dashboard');
    Dashboard = mod.default;
  });

  describe('Dashboard', () => {
    beforeEach(() => {
      cleanup();
      vi.clearAllMocks();
      vi.useRealTimers();
      activeListState.id = 'list-1';
      (api.getCurrentUserProfile as any).mockResolvedValue({
        response: { ok: true },
        data: { user: { id: 'u1' }, family: { id: 'f1', members: [] } },
      });
      (api.getItems as any).mockResolvedValue({
        response: { ok: true },
        data: { items: [] },
      });
      (api.getPackingList as any).mockResolvedValue({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' } },
      });
      (api.updatePackingList as any).mockResolvedValue({
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
      expect(api.updatePackingList).not.toHaveBeenCalled();

      vi.advanceTimersByTime(400);
      expect(api.updatePackingList).not.toHaveBeenCalled();

      fireEvent.blur(textarea);
      expect(api.updatePackingList).toHaveBeenCalledTimes(1);
      expect(api.updatePackingList).toHaveBeenCalledWith('list-1', { notes: 'Pack charger' });

      vi.advanceTimersByTime(1000);
      expect(api.updatePackingList).toHaveBeenCalledTimes(1);
    });

    it('ignores stale save responses after switch-away/switch-back for the same list', async () => {
      const pendingByList: Record<string, Array<(value: any) => void>> = {};
      (api.updatePackingList as any).mockImplementation((listId: string) => new Promise(resolve => {
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
      expect(api.updatePackingList).toHaveBeenNthCalledWith(1, 'list-1', { notes: 'old-list-first' });
      expect(api.updatePackingList).toHaveBeenNthCalledWith(2, 'list-1', { notes: 'old-list-second' });

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
      expect(api.updatePackingList).toHaveBeenNthCalledWith(3, 'list-2', { notes: 'new-list-notes' });

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
      expect(api.updatePackingList).toHaveBeenNthCalledWith(4, 'list-1', { notes: 'switchback-fresh' });

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
      expect(api.updatePackingList).toHaveBeenCalledTimes(4);
    });
  });
}
