/* @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { ElementDialog, ElementDialogTab } from '../components/ElementDialog';

const tabs: ElementDialogTab[] = [
  { value: 'details', label: 'Details', content: <div>Details body <input aria-label="notes" /></div> },
  { value: 'bookings', label: 'Bookings', count: 2, content: <div>Bookings body</div> },
  { value: 'seats', label: 'Seats', content: <div>Seats body</div> },
];

function swipe(target: Element, from: number, to: number, y = 100) {
  const start = [{ clientX: from, clientY: y }] as unknown as TouchList;
  const end = [{ clientX: to, clientY: y }] as unknown as TouchList;
  fireEvent.touchStart(target, { touches: start, changedTouches: start });
  fireEvent.touchEnd(target, { touches: end, changedTouches: end });
}

function renderDialog(props: Partial<React.ComponentProps<typeof ElementDialog>> = {}) {
  return renderWithMantine(<ElementDialog opened onClose={() => {}} title="DEN → SJD" tabs={tabs} {...props} />);
}

describe('ElementDialog', () => {
  afterEach(() => cleanup());

  it('shows the title and the first tab, with a count badge on tabs that have one', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('DEN → SJD')).toBeTruthy();
    expect(screen.getByText(/details body/i)).toBeTruthy();
    expect(screen.queryByText(/bookings body/i)).toBeNull();
    expect(screen.getByRole('tab', { name: /bookings/i }).textContent).toContain('2');
  });

  it('switches tabs on click and mounts only the active tab', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: /seats/i }));
    expect(screen.getByText(/seats body/i)).toBeTruthy();
    expect(screen.queryByText(/details body/i)).toBeNull();
  });

  it('moves to the next tab on a left swipe and the previous on a right swipe', () => {
    renderDialog();
    const body = screen.getByText(/details body/i).parentElement as HTMLElement;
    swipe(body, 250, 100);
    expect(screen.getByText(/bookings body/i)).toBeTruthy();

    swipe(screen.getByText(/bookings body/i), 100, 250);
    expect(screen.getByText(/details body/i)).toBeTruthy();
  });

  it('does not go past the first or last tab', () => {
    renderDialog();
    swipe(screen.getByText(/details body/i).parentElement as HTMLElement, 100, 250);
    expect(screen.getByText(/details body/i)).toBeTruthy();
  });

  it('ignores swipes that start in an input', () => {
    renderDialog();
    swipe(screen.getByLabelText('notes'), 250, 100);
    expect(screen.getByText(/details body/i)).toBeTruthy();
  });

  it('ignores swipes when swiping is disabled', () => {
    renderDialog({ swipeEnabled: false });
    swipe(screen.getByText(/details body/i).parentElement as HTMLElement, 250, 100);
    expect(screen.getByText(/details body/i)).toBeTruthy();
    expect(screen.queryByText(/bookings body/i)).toBeNull();
  });

  it('ignores mostly vertical movements', () => {
    renderDialog();
    const body = screen.getByText(/details body/i).parentElement as HTMLElement;
    const start = [{ clientX: 100, clientY: 50 }] as unknown as TouchList;
    const end = [{ clientX: 40, clientY: 300 }] as unknown as TouchList;
    fireEvent.touchStart(body, { touches: start, changedTouches: start });
    fireEvent.touchEnd(body, { touches: end, changedTouches: end });
    expect(screen.getByText(/details body/i)).toBeTruthy();
  });
});
