import {
  describe as _describe,
  it as _it,
  expect as _expect,
  beforeEach as _beforeEach,
  beforeAll as _beforeAll,
  vi as _vi,
} from 'vitest';
import * as api from '../api';
import { ImpersonationProvider } from '../contexts/ImpersonationContext';
import { RefreshProvider } from '../contexts/RefreshContext';

let hasTestingLibs = true;
try {
  require.resolve('@testing-library/react');
} catch {
  hasTestingLibs = false;
}

if (!hasTestingLibs) {
  _describe.skip('CategoryManagementPage (component tests skipped - install testing libs)', () => {});
} else {
  const rtl = require('@testing-library/react');
  const { render, screen, waitFor } = rtl;
  const { MemoryRouter } = require('react-router-dom');
  const React = require('react');
  const MantineProvider = React.Fragment;

  const { describe, it, expect, beforeEach, beforeAll, vi } = {
    describe: _describe,
    it: _it,
    expect: _expect,
    beforeEach: _beforeEach,
    beforeAll: _beforeAll,
    vi: _vi,
  };

  vi.mock('../api', () => ({
    getCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    getItems: vi.fn(),
    getItemsForCategory: vi.fn(),
    assignItemToCategory: vi.fn(),
    removeItemFromCategory: vi.fn(),
    deleteItem: vi.fn(),
    getFamily: vi.fn(),
    getCurrentUserProfile: vi.fn(),
    updateCategoryOrder: vi.fn(),
  }));

  vi.mock('../components/AddItemsDrawer', () => ({ default: () => null }));
  vi.mock('../components/ItemEditDrawer', () => ({ default: () => null }));
  vi.mock('../components/BulkEditDrawer', () => ({ default: () => null }));
  vi.mock('../components/ConfirmDelete', () => ({
    default: ({ title }: { title?: string }) => {
      const React = require('react');
      return React.createElement('button', { type: 'button' }, title || 'Delete');
    },
  }));

  vi.mock('@tabler/icons-react', () => ({
    IconTrash: () => null,
    IconEdit: () => null,
    IconPlus: () => null,
    IconX: () => null,
  }));

  vi.mock('@dnd-kit/core', () => ({
    DndContext: ({ children }: any) => {
      const React = require('react');
      return React.createElement('div', null, children);
    },
    closestCenter: vi.fn(),
    PointerSensor: function PointerSensor() {},
    useSensor: vi.fn(() => ({})),
    useSensors: vi.fn(() => []),
  }));

  vi.mock('@dnd-kit/sortable', () => ({
    arrayMove: vi.fn((arr: any[]) => arr),
    SortableContext: ({ children }: any) => {
      const React = require('react');
      return React.createElement('div', null, children);
    },
    useSortable: vi.fn(() => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: false,
    })),
    verticalListSortingStrategy: vi.fn(),
  }));

  vi.mock('@dnd-kit/utilities', () => ({
    CSS: { Transform: { toString: () => '' } },
  }));

  vi.mock('@mantine/core', () => {
    const React = require('react');
    const passthrough =
      (el = 'div') =>
      ({ children, ...props }: any) => {
        const allowed = new Set([
          'children',
          'onClick',
          'onChange',
          'value',
          'checked',
          'placeholder',
          'type',
          'disabled',
          'id',
          'name',
          'className',
          'style',
          'defaultValue',
          'onKeyDown',
          'role',
          'title',
          'aria-label',
        ]);
        const cleanProps: any = {};
        for (const [k, v] of Object.entries(props || {})) {
          if (allowed.has(k)) {
            cleanProps[k] = v;
          } else if (v !== undefined) {
            try {
              cleanProps[`data-prop-${k.toLowerCase()}`] = typeof v === 'string' ? v : JSON.stringify(v);
            } catch {
              cleanProps[`data-prop-${k.toLowerCase()}`] = String(v);
            }
          }
        }
        return React.createElement(el, cleanProps, children);
      };

    return {
      MantineProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
      Card: passthrough('div'),
      Title: passthrough('div'),
      Stack: passthrough('div'),
      Group: passthrough('div'),
      Button: passthrough('button'),
      TextInput: (props: any) => React.createElement('input', { ...props, placeholder: props.placeholder || props.label }),
      Loader: () => React.createElement('div', null, 'Loading...'),
      ActionIcon: passthrough('button'),
      Text: passthrough('span'),
      Select: ({ data = [], onChange, value, ...props }: any) => {
        const { searchable: _searchable, nothingFoundMessage: _nothingFoundMessage, mb: _mb, ...domProps } = props;
        return React.createElement(
          'select',
          {
            ...domProps,
            value: value ?? '',
            onChange: (e: any) => onChange?.(e.target.value || null),
          },
          data.map((opt: any) => React.createElement('option', { key: opt.value, value: opt.value }, opt.label))
        );
      },
      Modal: passthrough('div'),
      Checkbox: (props: any) => React.createElement('input', { type: 'checkbox', ...props }),
      Badge: passthrough('span'),
    };
  });

  let CategoryManagementPage: any;
  beforeAll(async () => {
    const mod = await import('../pages/CategoryManagementPage');
    CategoryManagementPage = mod.default;
  });

  describe('CategoryManagementPage', () => {
    beforeEach(() => {
      (api.getCurrentUserProfile as any).mockResolvedValue({
        response: { ok: true },
        data: { family: { id: 'f1', members: [] } },
      });
      (api.getCategories as any).mockResolvedValue({
        response: { ok: true },
        data: { categories: [{ id: 'c1', name: 'Bath' }] },
      });
      (api.getItems as any).mockResolvedValue({ response: { ok: true }, data: { items: [] } });
      (api.getItemsForCategory as any).mockResolvedValue({
        response: { ok: true },
        data: {
          items: [
            {
              id: 'i1',
              name: 'Aloe',
              itemGroupNames: ['All Trips', 'Camping'],
              memberIds: [],
              wholeFamily: true,
            },
          ],
        },
      });
    });

    it('renders all item-group badges on category item cards', async () => {
      render(
        <MemoryRouter>
          <MantineProvider>
            <RefreshProvider>
              <ImpersonationProvider>
                <CategoryManagementPage />
              </ImpersonationProvider>
            </RefreshProvider>
          </MantineProvider>
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByText('Aloe')).toBeTruthy());
      expect(screen.getByText('All Trips')).toBeTruthy();
      expect(screen.getByText('Camping')).toBeTruthy();
    });
  });
}
