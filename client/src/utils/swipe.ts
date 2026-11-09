export const SWIPE_MIN_DISTANCE = 50;
const HORIZONTAL_DOMINANCE = 1.5;

export type SwipeDirection = 'left' | 'right';

export function getSwipeDirection(
  start: { x: number; y: number },
  end: { x: number; y: number }
): SwipeDirection | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null;
  if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return null;
  return dx < 0 ? 'left' : 'right';
}

const INTERACTIVE = 'input, textarea, select, [data-no-swipe]';

// A swipe must not hijack typing, text selection, or horizontally scrollable regions.
export function isSwipeBlocked(target: EventTarget | null, boundary: HTMLElement | null): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el) {
    if (el.matches(INTERACTIVE)) return true;
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true;
    if (el === boundary) break;
    el = el.parentElement;
  }
  return false;
}
