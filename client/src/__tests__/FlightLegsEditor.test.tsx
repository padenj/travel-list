/* @vitest-environment jsdom */
import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({ tripApi: { lookupFlightAutofill: vi.fn() } }));

import { tripApi } from '../api/tripApi';
import { FlightLegsEditor } from '../components/FlightLegsEditor';
import { FlightLegDraft, emptyLegDraft } from '../utils/flightLegs';

const filled: FlightLegDraft = {
  flightCode: 'WN100', date: '2026-11-10', departureTime: '08:00', arrivalTime: '10:00', arrivalDayOffset: 0,
  departureAirport: 'DEN', arrivalAirport: 'DAL', checkPriceUrl: '',
};

let latest: FlightLegDraft[];

function Harness({ initial }: { initial: FlightLegDraft[] }) {
  const [legs, setLegs] = useState(initial);
  latest = legs;
  return <FlightLegsEditor tripId="trip-1" legs={legs} onChange={setLegs} />;
}

describe('FlightLegsEditor', () => {
  afterEach(() => cleanup());

  it('renders one titled form per leg without a remove button for a single leg', () => {
    renderWithMantine(<Harness initial={[emptyLegDraft()]} />);
    expect(screen.getByText('Leg 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove leg 1' })).toBeNull();
  });

  it('adds a leg that starts where the previous one ended', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness initial={[filled]} />);
    await user.click(screen.getByRole('button', { name: '+ Leg' }));
    expect(latest).toHaveLength(2);
    expect(latest[1]).toMatchObject({ date: '2026-11-10', departureAirport: 'DAL', arrivalAirport: '' });
    expect(screen.getByText('Leg 2')).toBeTruthy();
  });

  it('shows the layover between legs', () => {
    renderWithMantine(<Harness initial={[filled, { ...filled, flightCode: 'WN200', departureTime: '12:15', arrivalTime: '14:00', departureAirport: 'DAL', arrivalAirport: 'SJD' }]} />);
    expect(screen.getByText('Layover in DAL: 2h 15m')).toBeTruthy();
  });

  it('removes a leg', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness initial={[filled, { ...filled, departureAirport: 'DAL', arrivalAirport: 'SJD' }]} />);
    await user.click(screen.getByRole('button', { name: 'Remove leg 1' }));
    expect(latest).toHaveLength(1);
    expect(latest[0].arrivalAirport).toBe('SJD');
  });

  it('applies a lookup to the correct leg even if another leg was added before it resolved', async () => {
    const user = userEvent.setup();
    let resolveLookup!: (value: any) => void;
    (tripApi.lookupFlightAutofill as any).mockImplementation(
      () => new Promise(resolve => { resolveLookup = resolve; }),
    );
    renderWithMantine(<Harness initial={[emptyLegDraft(), { ...filled, flightCode: 'WN200' }]} />);

    await user.type(screen.getAllByLabelText('Flight #')[0], 'WN1234');
    fireEvent.change(screen.getAllByLabelText('Date')[0], { target: { value: '2026-08-29' } });
    await user.click(screen.getAllByRole('button', { name: 'Look up' })[0]);
    await waitFor(() => expect(tripApi.lookupFlightAutofill).toHaveBeenCalled());

    // Add a third leg before the lookup for leg 1 resolves.
    await user.click(screen.getByRole('button', { name: '+ Leg' }));
    expect(latest).toHaveLength(3);

    resolveLookup({
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29',
      departureAirport: 'DEN', arrivalAirport: 'DAL',
      departureDatetime: '2026-08-29T08:00:00.000', arrivalDatetime: '2026-08-29T10:00:00.000',
      statusText: 'Scheduled', sourceUrl: 'https://fs',
    });

    await waitFor(() => expect(screen.getAllByRole('status')[0]?.textContent).toMatch(/Filled from FlightStats/));
    expect(latest).toHaveLength(3);
    expect(latest[0]).toMatchObject({ departureAirport: 'DEN', arrivalAirport: 'DAL', departureTime: '08:00', arrivalTime: '10:00' });
  });

  it('keeps per-leg lookup state tied to leg identity when a leg is removed', async () => {
    const user = userEvent.setup();
    (tripApi.lookupFlightAutofill as any).mockResolvedValue({
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29',
      departureAirport: 'DEN', arrivalAirport: 'DAL',
      departureDatetime: '2026-08-29T08:00:00.000', arrivalDatetime: '2026-08-29T10:00:00.000',
      statusText: 'Scheduled', sourceUrl: 'https://fs',
    });
    const legB: FlightLegDraft = { ...filled, flightCode: 'WN999', departureAirport: 'SJD', arrivalAirport: 'LAX' };
    renderWithMantine(<Harness initial={[emptyLegDraft(), legB]} />);

    await user.type(screen.getAllByLabelText('Flight #')[0], 'WN1234');
    fireEvent.change(screen.getAllByLabelText('Date')[0], { target: { value: '2026-08-29' } });
    await user.click(screen.getAllByRole('button', { name: 'Look up' })[0]);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Filled from FlightStats/));

    await user.click(screen.getByRole('button', { name: 'Remove leg 1' }));

    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByLabelText('Flight #') as HTMLInputElement).value).toBe('WN999');
  });

  it('applies a lookup to the leg it was started on, not the leg that shifted into its index, when an earlier leg is removed', async () => {
    const user = userEvent.setup();
    let resolveLookup!: (value: any) => void;
    (tripApi.lookupFlightAutofill as any).mockImplementation(
      () => new Promise(resolve => { resolveLookup = resolve; }),
    );
    const legA: FlightLegDraft = { ...filled, flightCode: 'WN111', departureAirport: 'DEN', arrivalAirport: 'DAL' };
    const legB: FlightLegDraft = { ...filled, flightCode: 'WN555', departureAirport: 'DAL', arrivalAirport: 'SJD' };
    const legC: FlightLegDraft = { ...filled, flightCode: 'WN777', departureAirport: 'SJD', arrivalAirport: 'LAX' };
    renderWithMantine(<Harness initial={[legA, legB, legC]} />);

    // Start a lookup on leg B (index 1).
    await user.click(screen.getAllByRole('button', { name: 'Look up' })[1]);
    await waitFor(() => expect(tripApi.lookupFlightAutofill).toHaveBeenCalled());

    // Remove leg A (index 0) before the lookup resolves; B shifts to index 0, C to index 1.
    await user.click(screen.getByRole('button', { name: 'Remove leg 1' }));
    expect(latest).toHaveLength(2);

    resolveLookup({
      airlineCode: 'WN', flightNumber: '555', flightDate: filled.date,
      departureAirport: 'AAA', arrivalAirport: 'BBB',
      departureDatetime: `${filled.date}T09:00:00.000`, arrivalDatetime: `${filled.date}T11:00:00.000`,
      statusText: 'Scheduled', sourceUrl: 'https://fs',
    });

    await waitFor(() => expect(screen.getAllByRole('status')[0]?.textContent).toMatch(/Filled from FlightStats/));
    expect(latest).toHaveLength(2);
    const updatedB = latest.find(leg => leg.flightCode === 'WN555')!;
    expect(updatedB).toMatchObject({ departureAirport: 'AAA', arrivalAirport: 'BBB', departureTime: '09:00', arrivalTime: '11:00' });
    const unchangedC = latest.find(leg => leg.flightCode === 'WN777')!;
    expect(unchangedC).toMatchObject({ departureAirport: 'SJD', arrivalAirport: 'LAX' });
  });
});
