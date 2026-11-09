/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOnline } from '../utils/useOnline';

describe('useOnline', () => {
  it('follows online/offline events', () => {
    const { result } = renderHook(() => useOnline());
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current).toBe(false);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current).toBe(true);
  });
});
