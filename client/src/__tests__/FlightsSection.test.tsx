/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { FlightsSection } from '../components/FlightsSection';
import { FlightRow } from '../utils/flightRows';

const rows: FlightRow[] = [
  {
    id: 'el-1',
    name: 'DEN → SJD',
    dateLabel: 'Sat 8/29',
    priceLabel: '9,000 pts + $5.60',
    priceShared: true,
    confirmation: 'ABC123',
    bookingCount: 2,
    sortKey: '2026-08-29T09:00',
    legs: [
      { id: 'l1', label: 'WN722', route: 'DEN → PHX', times: '9:00 AM → 10:10 AM', layoverAfter: '1h 10m' },
      { id: 'l2', label: 'WN310', route: 'PHX → SJD', times: '11:20 AM → 1:05 PM', layoverAfter: null },
    ],
  },
  {
    id: 'el-2',
    name: 'Home',
    dateLabel: '',
    priceLabel: '',
    priceShared: false,
    confirmation: '',
    bookingCount: 0,
    sortKey: '9999',
    legs: [],
  },
];

describe('FlightsSection', () => {
  afterEach(() => cleanup());

  it('shows the count, total, rows and indented legs with layovers', () => {
    renderWithMantine(<FlightsSection rows={rows} totalLabel="9,000 pts + $5.60" onOpen={() => {}} />);

    expect(screen.getByText(/flights \(2\)/i)).toBeTruthy();
    expect(screen.getByText(/total 9,000 pts \+ \$5\.60/i)).toBeTruthy();
    expect(screen.getByText('DEN → SJD')).toBeTruthy();
    expect(screen.getByText('Sat 8/29')).toBeTruthy();
    expect(screen.getByText('ABC123')).toBeTruthy();
    expect(screen.getByText(/WN722 DEN → PHX/)).toBeTruthy();
    expect(screen.getByText('9:00 AM → 10:10 AM')).toBeTruthy();
    expect(screen.getByText(/1h 10m layover/i)).toBeTruthy();
    expect(screen.getByText(/shared/i)).toBeTruthy();
    expect(screen.getByText(/2 bookings/i)).toBeTruthy();
  });

  it('shows a muted note for flights without legs', () => {
    renderWithMantine(<FlightsSection rows={rows} totalLabel="" onOpen={() => {}} />);
    expect(screen.getByText(/no legs yet/i)).toBeTruthy();
    expect(screen.queryByText(/^total/i)).toBeNull();
  });

  it('opens a flight on click and on Enter/Space', () => {
    const onOpen = vi.fn();
    renderWithMantine(<FlightsSection rows={rows} totalLabel="" onOpen={onOpen} />);

    const rowButton = screen.getByRole('button', { name: /open DEN → SJD/i });
    fireEvent.click(rowButton);
    expect(onOpen).toHaveBeenLastCalledWith('el-1');

    const second = screen.getByRole('button', { name: /open Home/i });
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(onOpen).toHaveBeenLastCalledWith('el-2');
    fireEvent.keyDown(rowButton, { key: ' ' });
    expect(onOpen).toHaveBeenLastCalledWith('el-1');
  });
});
