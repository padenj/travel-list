import { describe, it, expect } from 'vitest';
import { formatMoney } from '../utils/money';
import { formatLayover, formatLegTime, layoverMinutes } from '../utils/flightLegs';

describe('formatMoney', () => {
  it('formats cents and whole dollars', () => {
    expect(formatMoney(137.96)).toBe('$137.96');
    expect(formatMoney(79)).toBe('$79.00');
  });

  it('puts the minus sign before the dollar sign', () => {
    expect(formatMoney(-20)).toBe('-$20.00');
  });
});

describe('flight leg helpers', () => {
  it('formats layovers and wall-clock times without timezone shifts', () => {
    expect(formatLayover(135)).toBe('2h 15m');
    expect(formatLayover(60)).toBe('1h');
    expect(formatLayover(45)).toBe('45m');
    expect(layoverMinutes('2026-11-10T10:00', '2026-11-10T12:15')).toBe(135);
    expect(layoverMinutes('2026-11-10T12:00', '2026-11-10T10:00')).toBeNull();
    expect(formatLegTime('2026-11-10T08:00')).toMatch(/Nov 10.*8:00\s?AM/);
  });
});
