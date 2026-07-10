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
  _describe.skip('Dashboard (component tests skipped - install testing libs)', () => {});
} else {
  const rtl = require('@testing-library/react');
  const userEvent = require('@testing-library/user-event');
  const React = require('react');
  const { MemoryRouter } = require('react-router-dom');
  const { render, screen } = rtl;
  const userEventLib = (userEvent && userEvent.default) || userEvent;

  const { describe, it, expect, beforeEach, beforeAll, vi } = { describe: _describe, it: _it, expect: _expect, beforeEach: _beforeEach, beforeAll: _beforeAll, vi: _vi };

  vi.mock('../api');

  const { requestOpenEdit, openForList, showNotification } = vi.hoisted(() => ({
    requestOpenEdit: vi.fn(),
    openForList: vi.fn(),
    showNotification: vi.fn(),
  }));

  vi.mock('@mantine/notifications', () => ({ showNotification }));

  vi.mock('../contexts/ActivePackingListContext', () => ({
    useActivePackingList: () => ({
      activeListId: 'list-1',
      requestOpenEdit,
      availableLists: [{ id: 'list-1', name: 'Summer Trip' }],
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
    default: () => null,
  }));
  vi.mock('../components/PackingListAuditPanel', () => ({
    default: () => null,
  }));
  vi.mock('../components/PackingListItemAuditModal', () => ({
    default: () => null,
  }));

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
  beforeAll(async () => {
    const mod = await import('../components/Dashboard');
    Dashboard = mod.default;
  });

  describe('Dashboard', () => {
    beforeEach(() => {
      vi.clearAllMocks();
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
        data: { items: [], checks: [] },
      });
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
  });
}
