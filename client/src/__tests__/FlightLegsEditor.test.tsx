/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../api/tripApi', () => ({
  tripApi: { lookupFlightAutofill: vi.fn() },
}));

import { tripApi } from '../api/tripApi';
import { FlightLegsEditor } from '../components/FlightLegsEditor';
import { FlightLegDraft, emptyLegDraft } from '../utils/flightLegs';

function Harness({ initial, spy }: { initial?: FlightLegDraft[]; spy?: (legs: FlightLegDraft[]) => void }) {
  const [legs, setLegs] = useState<FlightLegDraft[]>(initial ?? [emptyLegDraft()]);
  return (
    <FlightLegsEditor
      tripId="trip-1"
      legs={legs}
      onChange={(next) => {
        setLegs(next);
        spy?.(next);
      }}
    />
  );
}

describe('FlightLegsEditor', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  it('lets the user type airports and times manually', () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.change(screen.getByLabelText(/from \(airport/i), { target: { value: 'DEN' } });
    fireEvent.change(screen.getByLabelText(/^departs$/i), { target: { value: '2026-11-10T08:00' } });
    const last = spy.mock.calls[spy.mock.calls.length - 1][0] as FlightLegDraft[];
    expect(last[0]).toMatchObject({ departureAirport: 'DEN', departureDatetime: '2026-11-10T08:00' });
  });

  it('adds a connecting flight, shows the layover, and removes legs', () => {
    render(
      <Harness
        initial={[
          { ...emptyLegDraft('2026-11-10'), departureAirport: 'DEN', arrivalAirport: 'DAL', departureDatetime: '2026-11-10T08:00', arrivalDatetime: '2026-11-10T10:00' },
          { ...emptyLegDraft('2026-11-10'), departureAirport: 'DAL', arrivalAirport: 'SJD', departureDatetime: '2026-11-10T12:15', arrivalDatetime: '2026-11-10T14:00' },
        ]}
      />
    );
    expect(screen.getByText(/layover.*2h 15m/i)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /remove flight/i })[1]);
    expect(screen.queryByText(/layover/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /add connecting flight/i }));
    expect(screen.getAllByLabelText(/airline code/i)).toHaveLength(2);
  });

  it('fills the leg from a lookup result', async () => {
    (tripApi.lookupFlightAutofill as any).mockResolvedValue({
      airlineCode: 'WN', flightNumber: '722', flightDate: '2026-10-24',
      departureAirport: 'DEN', arrivalAirport: 'SJD',
      departureDatetime: '2026-10-24T09:00', arrivalDatetime: '2026-10-24T11:00',
      statusText: 'On time', sourceUrl: 'https://example.com',
    });
    render(<Harness initial={[{ ...emptyLegDraft('2026-10-24'), airline: 'WN', flightNumber: '722' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /look up flight details/i }));
    await waitFor(() => expect((screen.getByLabelText(/from \(airport/i) as HTMLInputElement).value).toBe('DEN'));
    expect((screen.getByLabelText(/^arrives$/i) as HTMLInputElement).value).toBe('2026-10-24T11:00');
    expect(screen.getByRole('status').textContent).toMatch(/on time/i);
  });

  it('tells the user when the lookup finds no schedule', async () => {
    (tripApi.lookupFlightAutofill as any).mockResolvedValue({
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-11-10', sourceUrl: 'https://example.com/fs',
    });
    render(<Harness initial={[{ ...emptyLegDraft('2026-11-10'), airline: 'WN', flightNumber: '1234' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /look up flight details/i }));
    expect(await screen.findByText(/no schedule found/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /flightstats/i }).getAttribute('href')).toBe('https://example.com/fs');
  });

  it('shows an error when the lookup request fails', async () => {
    (tripApi.lookupFlightAutofill as any).mockRejectedValue(new Error('boom'));
    render(<Harness initial={[{ ...emptyLegDraft('2026-11-10'), airline: 'WN', flightNumber: '1' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /look up flight details/i }));
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });
});
