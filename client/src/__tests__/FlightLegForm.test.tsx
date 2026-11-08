/* @vitest-environment jsdom */
import { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({
  tripApi: { lookupFlightAutofill: vi.fn() },
}));

import { tripApi } from '../api/tripApi';
import { FlightLegForm } from '../components/FlightLegForm';
import { FlightLegDraft, emptyLegDraft } from '../utils/flightLegs';

let latest: FlightLegDraft;

function Harness({ initial = emptyLegDraft() }: { initial?: FlightLegDraft }) {
  const [draft, setDraft] = useState(initial);
  latest = draft;
  return <FlightLegForm tripId="trip-1" draft={draft} onChange={setDraft} idPrefix="t" />;
}

describe('FlightLegForm', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  it('uppercases the flight code and airports', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness />);
    await user.type(screen.getByLabelText('Flight #'), 'wn1234');
    await user.type(screen.getByLabelText('From'), 'den');
    expect(latest.flightCode).toBe('WN1234');
    expect(latest.departureAirport).toBe('DEN');
  });

  it('switches the arrival day to +1 when arrival is earlier than departure', () => {
    renderWithMantine(<Harness />);
    fireEvent.change(screen.getByLabelText('Departs'), { target: { value: '23:00' } });
    fireEvent.change(screen.getByLabelText('Arrives'), { target: { value: '01:30' } });
    expect(latest.arrivalDayOffset).toBe(1);
    expect((screen.getByRole('radio', { name: '+1' }) as HTMLInputElement).checked).toBe(true);

    fireEvent.change(screen.getByLabelText('Arrives'), { target: { value: '23:55' } });
    expect(latest.arrivalDayOffset).toBe(0);
  });

  it('lets the user pick +2 manually', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness />);
    await user.click(screen.getByRole('radio', { name: '+2' }));
    expect(latest.arrivalDayOffset).toBe(2);
  });

  it('looks up the flight with the parsed code and date and fills the draft', async () => {
    const user = userEvent.setup();
    (tripApi.lookupFlightAutofill as any).mockResolvedValue({
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29',
      departureAirport: 'DEN', arrivalAirport: 'DAL',
      departureDatetime: '2026-08-29T08:00:00.000', arrivalDatetime: '2026-08-29T10:00:00.000',
      statusText: 'Scheduled', sourceUrl: 'https://fs',
    });
    renderWithMantine(<Harness />);
    await user.type(screen.getByLabelText('Flight #'), 'WN1234');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-29' } });
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(tripApi.lookupFlightAutofill).toHaveBeenCalledWith('trip-1', {
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29',
    }));
    await waitFor(() => expect(latest).toMatchObject({ departureAirport: 'DEN', arrivalAirport: 'DAL', departureTime: '08:00', arrivalTime: '10:00' }));
    expect(screen.getByRole('status').textContent).toMatch(/Filled from FlightStats \(Scheduled\)/);
  });

  it('explains what is missing before looking up', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.getByRole('status').textContent).toMatch(/Enter the flight # \(e\.g\. WN1234\) and date/);
    expect(tripApi.lookupFlightAutofill).not.toHaveBeenCalled();
  });

  it('keeps an in-flight edit and still applies the lookup result once it resolves', async () => {
    const user = userEvent.setup();
    let resolveLookup!: (value: any) => void;
    (tripApi.lookupFlightAutofill as any).mockImplementation(
      () => new Promise(resolve => { resolveLookup = resolve; }),
    );
    renderWithMantine(<Harness />);
    await user.type(screen.getByLabelText('Flight #'), 'WN1234');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-29' } });
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(tripApi.lookupFlightAutofill).toHaveBeenCalled());

    // Edit unrelated field while the lookup is still pending.
    await user.type(screen.getByLabelText('Price check link'), 'https://example.com');
    expect(latest.checkPriceUrl).toBe('https://example.com');

    resolveLookup({
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29',
      departureAirport: 'DEN', arrivalAirport: 'DAL',
      departureDatetime: '2026-08-29T08:00:00.000', arrivalDatetime: '2026-08-29T10:00:00.000',
      statusText: 'Scheduled', sourceUrl: 'https://fs',
    });

    await waitFor(() => expect(latest).toMatchObject({ departureAirport: 'DEN', arrivalAirport: 'DAL', departureTime: '08:00', arrivalTime: '10:00' }));
    expect(latest.checkPriceUrl).toBe('https://example.com');
  });

  it('drops a lookup result if the flight code changed while the request was in flight', async () => {
    const user = userEvent.setup();
    let resolveLookup!: (value: any) => void;
    (tripApi.lookupFlightAutofill as any).mockImplementation(
      () => new Promise(resolve => { resolveLookup = resolve; }),
    );
    renderWithMantine(<Harness />);
    await user.type(screen.getByLabelText('Flight #'), 'WN1234');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-29' } });
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(tripApi.lookupFlightAutofill).toHaveBeenCalled());

    // Flight code changes while the lookup for the old code is still pending.
    await user.type(screen.getByLabelText('Flight #'), '5');

    resolveLookup({
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29',
      departureAirport: 'DEN', arrivalAirport: 'DAL',
      departureDatetime: '2026-08-29T08:00:00.000', arrivalDatetime: '2026-08-29T10:00:00.000',
      statusText: 'Scheduled', sourceUrl: 'https://fs',
    });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Look up' })?.getAttribute('data-loading')).not.toBe('true'));
    expect(latest.departureAirport).toBe('');
    expect(latest.arrivalAirport).toBe('');
  });

  it('clears the stale "Filled from FlightStats" message when the flight code changes', async () => {
    const user = userEvent.setup();
    (tripApi.lookupFlightAutofill as any).mockResolvedValue({
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29',
      departureAirport: 'DEN', arrivalAirport: 'DAL',
      departureDatetime: '2026-08-29T08:00:00.000', arrivalDatetime: '2026-08-29T10:00:00.000',
      statusText: 'Scheduled', sourceUrl: 'https://fs',
    });
    renderWithMantine(<Harness />);
    await user.type(screen.getByLabelText('Flight #'), 'WN1234');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-29' } });
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Filled from FlightStats/));

    await user.type(screen.getByLabelText('Flight #'), '5');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
