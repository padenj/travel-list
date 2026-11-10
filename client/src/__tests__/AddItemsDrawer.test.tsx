/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api', () => ({
  getItems: vi.fn(),
  getCategories: vi.fn(),
  getMembersForItem: vi.fn(),
}));
vi.mock('../components/ItemEditDrawer', () => ({
  default: (props: any) => (props.opened ? <div data-testid="item-edit-drawer">{props.initialName}</div> : null),
}));
vi.mock('@mantine/notifications', () => ({ showNotification: vi.fn() }));

import * as api from '../api';
import AddItemsDrawer from '../components/AddItemsDrawer';

describe('AddItemsDrawer', () => {
  beforeEach(() => {
    (api.getItems as any).mockResolvedValue({ response: { ok: true }, data: { items: [{ id: 'i1', name: 'Socks' }] } });
    (api.getCategories as any).mockResolvedValue({ response: { ok: true }, data: { categories: [] } });
    (api.getMembersForItem as any).mockResolvedValue({ response: { ok: true }, data: [] });
  });
  afterEach(cleanup);

  it('still offers creating a new item when every existing item is already on the list', async () => {
    renderWithMantine(<AddItemsDrawer opened onClose={() => {}} familyId="f1" excludedItemIds={['i1']} onApply={vi.fn()} />);
    expect(await screen.findByText('No available items')).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText(/Search/), 'sun hat');
    await userEvent.click(await screen.findByRole('button', { name: /Add New Item: "Sun Hat"/ }));
    expect(screen.getByTestId('item-edit-drawer').textContent).toBe('Sun Hat');
  });
});
