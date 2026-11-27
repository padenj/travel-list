/* @vitest-environment jsdom */
import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { PriceEntry } from '../components/PriceEntry';
import { PriceEntryValue, emptyPriceEntry } from '../utils/priceEntry';

function Harness({ initial = emptyPriceEntry(), onValue }: { initial?: PriceEntryValue; onValue?: (v: PriceEntryValue) => void }) {
  const [value, setValue] = useState(initial);
  return <PriceEntry value={value} onChange={next => { setValue(next); onValue?.(next); }} />;
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('PriceEntry', () => {
  afterEach(() => cleanup());

  it('splits the total between booking and check-in', () => {
    renderWithMantine(<Harness />);
    expect(screen.getByText("What you'll pay")).toBeTruthy();
    type('Total price (cash)', '1612.40');
    type('Due at check-in', '182.40');
    type('Check-in note', 'Resort fee');
    expect(screen.getByText('At booking $1,430.00 · At check-in $182.40 (Resort fee)')).toBeTruthy();
  });

  it('pay at check-in turns the other amount into a deposit', () => {
    const onValue = vi.fn();
    renderWithMantine(<Harness onValue={onValue} />);
    type('Total price (cash)', '1612.40');
    fireEvent.click(screen.getByRole('radio', { name: 'Check-in' }));
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ payAt: 'checkin' }));
    expect((screen.getByLabelText('Total price (cash)') as HTMLInputElement).value).toBe('1612.40');
    type('Due at booking (deposit)', '100');
    expect(screen.queryByLabelText('Due at check-in')).toBeNull();
    expect(screen.getByText('At booking $100.00 · At check-in $1,512.40')).toBeTruthy();
  });

  it('shows points with cash taxes', () => {
    renderWithMantine(<Harness />);
    type('Total price (points)', '9000');
    type('Total price (cash)', '1289.60');
    type('Due at check-in', '39.60');
    expect(screen.getByText('At booking 9,000 pts + $1,250.00 · At check-in $39.60')).toBeTruthy();
  });

  it('shows a problem instead of the preview', () => {
    renderWithMantine(<Harness />);
    type('Total price (cash)', '10');
    type('Due at check-in', '20');
    expect(screen.getByText("Due at check-in can't be more than the total price")).toBeTruthy();
  });
});
