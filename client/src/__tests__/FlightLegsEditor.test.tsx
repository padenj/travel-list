/* @vitest-environment jsdom */
import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({ tripApi: { lookupFlightAutofill: vi.fn() } }));

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
});
