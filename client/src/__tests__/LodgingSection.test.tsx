/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingSection } from '../components/LodgingSection';
import { LodgingRow } from '../utils/lodgingRows';

const rows: LodgingRow[] = [
  { id: 'h1', name: 'Hyatt Ziva', checkInDate: '2027-03-01', dateLabel: 'Mar 1 → Mar 5 · 4 nts', nights: 4,
    priceLabel: '$1,612.00 ($403.00/nt)', confirmation: '7231004 / H-88213', roomCount: 2,
    destination: { name: 'Cabo', color: '#ff8800' }, deadline: { label: 'Free cancel until Feb 27', state: 'soon' } },
  { id: 'h2', name: 'Airport Inn', checkInDate: '2027-03-05', dateLabel: 'Mar 5 → Mar 6 · 1 nt', nights: 1,
    priceLabel: '—', confirmation: '—', roomCount: 0, destination: null, deadline: { label: 'Cancel by Feb 1', state: 'passed' } },
];

describe('LodgingSection', () => {
  afterEach(() => cleanup());

  it('renders the band, rows, chips and deadline states', () => {
    renderWithMantine(<LodgingSection rows={rows} totalLabel="$1,612.00" onOpen={() => {}} />);
    const section = screen.getByRole('region', { name: 'Lodging' });
    expect(within(section).getByText(/Lodging \(2\)/)).toBeTruthy();
    expect(within(section).getByText('Total $1,612.00')).toBeTruthy();
    const first = within(section).getByRole('button', { name: 'Open Hyatt Ziva' });
    expect(within(first).getByText('Mar 1 → Mar 5 · 4 nts')).toBeTruthy();
    expect(within(first).getByText('$1,612.00 ($403.00/nt)')).toBeTruthy();
    expect(within(first).getByText('7231004 / H-88213')).toBeTruthy();
    expect(within(first).getByText('2 rooms')).toBeTruthy();
    expect(within(first).getByText('Cabo')).toBeTruthy();
    expect(within(first).getByText('Free cancel until Feb 27').getAttribute('data-state')).toBe('soon');
    const second = within(section).getByRole('button', { name: 'Open Airport Inn' });
    expect(within(second).queryByText(/rooms?$/)).toBeNull();
    expect(within(second).getByText('Cancel by Feb 1').getAttribute('data-state')).toBe('passed');
  });

  it('opens on click and Enter', () => {
    const onOpen = vi.fn();
    renderWithMantine(<LodgingSection rows={rows} totalLabel="" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Hyatt Ziva' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open Airport Inn' }), { key: 'Enter' });
    expect(onOpen.mock.calls).toEqual([['h1'], ['h2']]);
  });
});
