import { describe, it, expect } from 'vitest';
import { formatMoney } from '../utils/money';

describe('formatMoney', () => {
  it('formats cents and whole dollars', () => {
    expect(formatMoney(137.96)).toBe('$137.96');
    expect(formatMoney(79)).toBe('$79.00');
  });

  it('puts the minus sign before the dollar sign', () => {
    expect(formatMoney(-20)).toBe('-$20.00');
  });
});
