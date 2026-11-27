/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/paymentMethodApi', () => ({
  paymentMethodApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

import { FirstPaymentFields } from '../components/FirstPaymentFields';

const draft = { enabled: true, transactionDate: '2027-01-05', paymentMethodId: null };

describe('FirstPaymentFields', () => {
  afterEach(() => cleanup());

  it('shows the amount, date and method when enabled', () => {
    renderWithMantine(<FirstPaymentFields value={draft} onChange={() => {}} amountLabel="9,000 pts + $1,250.00" />);
    expect((screen.getByLabelText('Also record payment') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Records a payment of 9,000 pts + $1,250.00')).toBeTruthy();
    expect((screen.getByLabelText('Payment date') as HTMLInputElement).value).toBe('2027-01-05');
    expect(screen.getByRole('textbox', { name: 'Payment method' })).toBeTruthy();
  });

  it('hides the fields when unchecked and reports changes', () => {
    const onChange = vi.fn();
    const { rerender } = renderWithMantine(<FirstPaymentFields value={draft} onChange={onChange} amountLabel="$10.00" />);
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2027-01-06' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...draft, transactionDate: '2027-01-06' });
    fireEvent.click(screen.getByLabelText('Also record payment'));
    expect(onChange).toHaveBeenLastCalledWith({ ...draft, enabled: false });
    rerender(
      <MantineProvider env="test">
        <FirstPaymentFields value={{ ...draft, enabled: false }} onChange={onChange} amountLabel="$10.00" />
      </MantineProvider>,
    );
    expect(screen.queryByLabelText('Payment date')).toBeNull();
  });
});
