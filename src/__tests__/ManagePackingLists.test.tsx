import { describe as _describe, it as _it, expect as _expect, beforeEach as _beforeEach, beforeAll as _beforeAll, vi as _vi } from 'vitest';
import * as api from '../api';

// Guard for testing libs
let hasTestingLibs = true;
try {
  require.resolve('@testing-library/react');
  require.resolve('@testing-library/user-event');
} catch (e) {
  hasTestingLibs = false;
}

if (!hasTestingLibs) {
  _describe.skip('ManagePackingLists (component tests skipped - install testing libs)', () => {});
} else {
  const rtl = require('@testing-library/react');
  const userEvent = require('@testing-library/user-event');
  const { render, screen, waitFor } = rtl;
  const userEventLib = (userEvent && userEvent.default) || userEvent;
  const { MemoryRouter } = require('react-router-dom');
  const React = require('react');
  const MantineProvider = React.Fragment;

  const { describe, it, expect, beforeEach, beforeAll, vi } = { describe: _describe, it: _it, expect: _expect, beforeEach: _beforeEach, beforeAll: _beforeAll, vi: _vi };

  vi.mock('../api');

  vi.mock('@mantine/core', () => {
    const React = require('react');
    const passthrough = (el = 'div') => ({ children, ...props }: any) => {
      const allowed = new Set(['children', 'onClick', 'onChange', 'value', 'checked', 'placeholder', 'type', 'disabled', 'id', 'name', 'className', 'style', 'defaultValue', 'onKeyDown', 'role', 'title']);
      const cleanProps: any = {};
      for (const [k, v] of Object.entries(props || {})) {
        if (allowed.has(k)) {
          cleanProps[k] = v as any;
        } else if (v !== undefined) {
          try {
            cleanProps[`data-prop-${k.toLowerCase()}`] = typeof v === 'string' ? v : JSON.stringify(v);
          } catch (e) {
            cleanProps[`data-prop-${k.toLowerCase()}`] = String(v);
          }
        }
      }
      return React.createElement(el, cleanProps, children);
    };

    return {
      MantineProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
      Modal: passthrough('div'),
      Text: passthrough('div'),
      Title: passthrough('div'),
      Group: passthrough('div'),
      Stack: passthrough('div'),
      Button: passthrough('button'),
      TextInput: (props: any) => React.createElement('input', { ...props, placeholder: props.label }),
      Select: (props: any) => React.createElement('select', { ...props }),
      Checkbox: (props: any) => React.createElement('input', { type: 'checkbox', ...props }),
      Card: passthrough('div'),
      Drawer: passthrough('div'),
      Badge: passthrough('div'),
      useMantineTheme: () => ({}),
    };
  });

  let ManagePackingLists: any;
  beforeAll(async () => {
    const mod = await import('../components/ManagePackingLists');
    ManagePackingLists = mod.default;
  });

  describe('ManagePackingLists - Item Edit Drawer', () => {
    beforeEach(() => {
      // default mocks
      (api.getCurrentUserProfile as any).mockResolvedValue({ response: { ok: true }, data: { family: { id: 'f1', members: [{ id: 'm1', name: 'Alice' }, { id: 'm2', name: 'Bob' }] } } });
      (api.getFamilyPackingLists as any).mockResolvedValue({ response: { ok: true }, data: { lists: [{ id: 'list1', name: 'My List' }] } });
      (api.getPackingList as any).mockResolvedValue({ response: { ok: true }, data: { items: [{ id: 'pli1', item_id: 'item1', display_name: 'Passport', members: [], whole_family: false }] } });
      (api.getCategoriesForItem as any).mockResolvedValue({ response: { ok: true }, data: [] });
      (api.getCategories as any).mockResolvedValue({ response: { ok: true }, data: { categories: [{ id: 'c1', name: 'Documents' }, { id: 'c2', name: 'Electronics' }] } });
      (api.getMembersForItem as any).mockResolvedValue({ response: { ok: true }, data: [] });

      // assignment/category APIs
      (api.assignItemToCategory as any).mockResolvedValue({ response: { ok: true }, data: {} });
      (api.removeItemFromCategory as any).mockResolvedValue({ response: { ok: true }, data: {} });
      (api.assignToMember as any).mockResolvedValue({ response: { ok: true }, data: {} });
      (api.removeFromMember as any).mockResolvedValue({ response: { ok: true }, data: {} });
      (api.assignToWholeFamily as any).mockResolvedValue({ response: { ok: true }, data: {} });
      (api.removeFromWholeFamily as any).mockResolvedValue({ response: { ok: true }, data: {} });
    });

    it('opens item edit drawer and loads categories and members', async () => {
      const { ActivePackingListProvider } = await import('../contexts/ActivePackingListContext');
      render(
        <MemoryRouter>
          <MantineProvider>
            <ActivePackingListProvider>
              <ManagePackingLists />
            </ActivePackingListProvider>
          </MantineProvider>
        </MemoryRouter>
      );

      // Wait for lists to be loaded
      await waitFor(() => expect(api.getFamilyPackingLists).toHaveBeenCalled());

      // Click the list-level Edit button (first 'Edit' button)
      const user = await userEventLib.setup();
      const editButtons = screen.getAllByText('Edit');
      // First click opens the edit drawer for the list
      await user.click(editButtons[0]);

      await waitFor(() => expect(api.getPackingList).toHaveBeenCalled());

      // After list items load, there should be another 'Edit' button for the item
      const editButtonsAfter = screen.getAllByText('Edit');
      // Click the second Edit (item-level)
      await user.click(editButtonsAfter[1]);

      // Expect the item details APIs to be called
      await waitFor(() => expect(api.getCategories).toHaveBeenCalled());
      await waitFor(() => expect(api.getMembersForItem).toHaveBeenCalled());
    });

    it('saves with no-op when nothing changed', async () => {
      const { ActivePackingListProvider } = await import('../contexts/ActivePackingListContext');
      render(
        <MemoryRouter>
          <MantineProvider>
            <ActivePackingListProvider>
              <ManagePackingLists />
            </ActivePackingListProvider>
          </MantineProvider>
        </MemoryRouter>
      );

      await waitFor(() => expect(api.getFamilyPackingLists).toHaveBeenCalled());
      const user = await userEventLib.setup();
      const editButtons = screen.getAllByText('Edit');
      await user.click(editButtons[0]);
      await waitFor(() => expect(api.getPackingList).toHaveBeenCalled());
      const editButtonsAfter = screen.getAllByText('Edit');
      await user.click(editButtonsAfter[1]);

      // Click Save without making changes
      const saveBtn = screen.getByText('Save');
      await user.click(saveBtn);

      // Assignment/category APIs should not be called because there's no change
      expect(api.assignItemToCategory).not.toHaveBeenCalled();
      expect(api.removeItemFromCategory).not.toHaveBeenCalled();
      expect(api.assignToMember).not.toHaveBeenCalled();
      expect(api.removeFromMember).not.toHaveBeenCalled();
      expect(api.assignToWholeFamily).not.toHaveBeenCalled();
      expect(api.removeFromWholeFamily).not.toHaveBeenCalled();
    });
  });
}
