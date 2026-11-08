/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { getSwipeDirection, isSwipeBlocked } from '../utils/swipe';

describe('getSwipeDirection', () => {
  it('detects a left swipe (finger moves left)', () => {
    expect(getSwipeDirection({ x: 200, y: 100 }, { x: 100, y: 110 })).toBe('left');
  });

  it('detects a right swipe', () => {
    expect(getSwipeDirection({ x: 100, y: 100 }, { x: 200, y: 90 })).toBe('right');
  });

  it('ignores short movements', () => {
    expect(getSwipeDirection({ x: 100, y: 100 }, { x: 130, y: 100 })).toBeNull();
  });

  it('ignores mostly vertical movements', () => {
    expect(getSwipeDirection({ x: 100, y: 100 }, { x: 160, y: 260 })).toBeNull();
  });
});

describe('isSwipeBlocked', () => {
  function tree() {
    const boundary = document.createElement('div');
    const wrapper = document.createElement('div');
    const input = document.createElement('input');
    const text = document.createElement('span');
    const guarded = document.createElement('div');
    const guardedChild = document.createElement('span');
    guarded.setAttribute('data-no-swipe', '');
    guarded.appendChild(guardedChild);
    wrapper.append(input, text, guarded);
    boundary.appendChild(wrapper);
    document.body.appendChild(boundary);
    return { boundary, input, text, guardedChild, wrapper };
  }

  it('blocks swipes that start in form controls', () => {
    const { boundary, input } = tree();
    expect(isSwipeBlocked(input, boundary)).toBe(true);
  });

  it('blocks swipes inside data-no-swipe regions', () => {
    const { boundary, guardedChild } = tree();
    expect(isSwipeBlocked(guardedChild, boundary)).toBe(true);
  });

  it('blocks swipes inside horizontally scrollable regions', () => {
    const { boundary, text, wrapper } = tree();
    wrapper.style.overflowX = 'auto';
    Object.defineProperty(wrapper, 'scrollWidth', { value: 500, configurable: true });
    Object.defineProperty(wrapper, 'clientWidth', { value: 200, configurable: true });
    expect(isSwipeBlocked(text, boundary)).toBe(true);
  });

  it('allows swipes on plain content', () => {
    const { boundary, text } = tree();
    expect(isSwipeBlocked(text, boundary)).toBe(false);
  });
});
