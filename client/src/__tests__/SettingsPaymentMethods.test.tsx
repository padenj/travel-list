/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/paymentMethodApi', () => ({
  paymentMethodApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

import { paymentMethodApi } from '../api/paymentMethodApi';
import SettingsPaymentMethods from '../components/SettingsPaymentMethods';

const api = vi.mocked(paymentMethodApi);
const method = (id: string, nickname: string, extra: Partial<{ archived: boolean; transactionCount: number }> = {}) =>
  ({ id, nickname, archived: false, transactionCount: 0, createdAt: '', updatedAt: '', ...extra });

describe('SettingsPaymentMethods', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue([
      method('pm1', 'Visa - 1234', { transactionCount: 2 }),
      method('pm2', 'Unused'),
      method('pm3', 'Old Amex', { archived: true, transactionCount: 1 }),
    ]);
  });

  it('lists methods with usage and archived state', async () => {
    renderWithMantine(<SettingsPaymentMethods />);
    expect(await screen.findByText('Visa - 1234')).toBeTruthy();
    expect(api.list).toHaveBeenCalledWith(true);
    expect(screen.getByText('2 transactions')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
  });

  it('adds a method', async () => {
    api.create.mockResolvedValue(method('pm4', 'Southwest CC - 9876'));
    renderWithMantine(<SettingsPaymentMethods />);
    await screen.findByText('Visa - 1234');
    await userEvent.type(screen.getByLabelText('New payment method'), 'Southwest CC - 9876');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('Southwest CC - 9876'));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('renames, archives, unarchives', async () => {
    api.update.mockResolvedValue(method('pm1', 'x'));
    renderWithMantine(<SettingsPaymentMethods />);
    await screen.findByText('Visa - 1234');
    await userEvent.click(screen.getByRole('button', { name: 'Rename Visa - 1234' }));
    const input = screen.getByLabelText('Nickname for Visa - 1234');
    await userEvent.clear(input);
    await userEvent.type(input, 'Visa - 4242');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('pm1', { nickname: 'Visa - 4242' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive Visa - 1234' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('pm1', { archived: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive Old Amex' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('pm3', { archived: false }));
  });

  it('only offers delete for unused methods, with confirmation', async () => {
    api.remove.mockResolvedValue(undefined);
    renderWithMantine(<SettingsPaymentMethods />);
    await screen.findByText('Visa - 1234');
    expect(screen.queryByRole('button', { name: 'Delete Visa - 1234' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Unused' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('pm2'));
  });

  it('shows API errors', async () => {
    api.create.mockRejectedValue(new Error('A payment method with that nickname already exists'));
    renderWithMantine(<SettingsPaymentMethods />);
    await screen.findByText('Visa - 1234');
    await userEvent.type(screen.getByLabelText('New payment method'), 'visa - 1234');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('A payment method with that nickname already exists')).toBeTruthy();
  });
});
