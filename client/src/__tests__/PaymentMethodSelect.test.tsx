/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/paymentMethodApi', () => ({
  paymentMethodApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

import { paymentMethodApi } from '../api/paymentMethodApi';
import { PaymentMethodSelect } from '../components/PaymentMethodSelect';

const method = (id: string, nickname: string, archived = false) =>
  ({ id, nickname, archived, transactionCount: 0, createdAt: '', updatedAt: '' });

describe('PaymentMethodSelect', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentMethodApi.list).mockResolvedValue([method('pm1', 'Visa - 1234'), method('pm2', 'Old Amex', true)]);
  });

  it('lists active methods and picks one', async () => {
    const onChange = vi.fn();
    renderWithMantine(<PaymentMethodSelect value={null} onChange={onChange} />);
    await waitFor(() => expect(paymentMethodApi.list).toHaveBeenCalledWith(true));
    fireEvent.click(screen.getByRole('textbox', { name: 'Payment method' }));
    expect(await screen.findByRole('option', { name: 'Visa - 1234' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Old Amex/ })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Visa - 1234' }));
    expect(onChange).toHaveBeenCalledWith('pm1');
  });

  it('shows the current archived method as (archived)', async () => {
    renderWithMantine(<PaymentMethodSelect value="pm2" onChange={() => {}} />);
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Payment method' }) as HTMLInputElement).value).toBe('Old Amex (archived)'));
  });

  it('adds a new method inline and selects it', async () => {
    vi.mocked(paymentMethodApi.create).mockResolvedValue(method('pm3', 'Southwest CC - 9876'));
    const onChange = vi.fn();
    renderWithMantine(<PaymentMethodSelect value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('textbox', { name: 'Payment method' }));
    fireEvent.click(await screen.findByRole('option', { name: '+ New payment method…' }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('New payment method'), 'Southwest CC - 9876');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('pm3'));
    expect(paymentMethodApi.create).toHaveBeenCalledWith('Southwest CC - 9876');
    expect(screen.queryByLabelText('New payment method')).toBeNull();
  });

  it('shows create errors and can cancel', async () => {
    vi.mocked(paymentMethodApi.create).mockRejectedValue(new Error('A payment method with that nickname already exists'));
    renderWithMantine(<PaymentMethodSelect value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('textbox', { name: 'Payment method' }));
    fireEvent.click(await screen.findByRole('option', { name: '+ New payment method…' }));
    await userEvent.type(screen.getByLabelText('New payment method'), 'Visa - 1234');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('A payment method with that nickname already exists')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('New payment method')).toBeNull();
  });
});
