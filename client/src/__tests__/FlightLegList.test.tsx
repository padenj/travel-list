/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { FlightLeg } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: { syncLegs: vi.fn(), lookupFlightAutofill: vi.fn() },
}));

import { tripApi } from '../api/tripApi';
import { FlightLegList } from '../components/FlightLegList';

const api = tripApi as any;

const legs: FlightLeg[] = [
  { id: 'leg-1', elementId: 'el-7', legOrder: 1, departureAirport: 'DEN', departureDatetime: '2026-11-10T08:00', arrivalAirport: 'DAL', arrivalDatetime: '2026-11-10T10:00', airline: 'WN', flightNumber: '100', layoverMinutesAfter: 135, createdAt: '', updatedAt: '' },
  { id: 'leg-2', elementId: 'el-7', legOrder: 2, departureAirport: 'DAL', departureDatetime: '2026-11-10T12:15', arrivalAirport: 'SJD', arrivalDatetime: '2026-11-10T14:00', airline: 'WN', flightNumber: '200', createdAt: '', updatedAt: '' },
];

const leg1Payload = {
  id: 'leg-1', departureAirport: 'DEN', departureDatetime: '2026-11-10T08:00', arrivalAirport: 'DAL',
  arrivalDatetime: '2026-11-10T10:00', airline: 'WN', flightNumber: '100', checkPriceUrl: undefined,
};

function renderList(props: Partial<React.ComponentProps<typeof FlightLegList>> = {}) {
  const onChanged = vi.fn();
  const onEditingChange = vi.fn();
  renderWithMantine(
    <FlightLegList tripId="trip-1" elementId="el-7" legs={legs} onChanged={onChanged} onEditingChange={onEditingChange} {...props} />
  );
  return { onChanged, onEditingChange };
}

describe('FlightLegList', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    api.syncLegs.mockResolvedValue([]);
  });

  it('shows compact leg lines with the layover', () => {
    renderList();
    expect(screen.getByText('WN100 · DEN 8:00a → DAL 10:00a')).toBeTruthy();
    expect(screen.getByText('WN200 · DAL 12:15p → SJD 2:00p')).toBeTruthy();
    expect(screen.getByText('Layover: 2h 15m')).toBeTruthy();
  });

  it('edits one leg inline and saves the full list', async () => {
    const user = userEvent.setup();
    const { onChanged, onEditingChange } = renderList();
    await user.click(screen.getByRole('button', { name: 'Edit leg 2' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);

    const code = screen.getByLabelText('Flight #');
    await user.clear(code);
    await user.type(code, 'WN201');
    await user.click(screen.getByRole('button', { name: 'Save leg' }));

    await waitFor(() => expect(api.syncLegs).toHaveBeenCalledWith('trip-1', 'el-7', [
      leg1Payload,
      { id: 'leg-2', departureAirport: 'DAL', departureDatetime: '2026-11-10T12:15', arrivalAirport: 'SJD', arrivalDatetime: '2026-11-10T14:00', airline: 'WN', flightNumber: '201', checkPriceUrl: undefined },
    ]));
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save leg' })).toBeNull());
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('adds a leg prefilled from the last leg', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('button', { name: '+ Leg' }));
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('SJD');
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-11-10');

    await user.type(screen.getByLabelText('Flight #'), 'WN300');
    await user.type(screen.getByLabelText('To'), 'LAX');
    fireEvent.change(screen.getByLabelText('Departs'), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText('Arrives'), { target: { value: '17:30' } });
    await user.click(screen.getByRole('button', { name: 'Save leg' }));

    await waitFor(() => expect(api.syncLegs).toHaveBeenCalled());
    const sent = api.syncLegs.mock.calls[0][2];
    expect(sent).toHaveLength(3);
    expect(sent[2]).toEqual({
      id: undefined, departureAirport: 'SJD', departureDatetime: '2026-11-10T16:00', arrivalAirport: 'LAX',
      arrivalDatetime: '2026-11-10T17:30', airline: 'WN', flightNumber: '300', checkPriceUrl: undefined,
    });
  });

  it('validates before saving and keeps the form open', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('button', { name: '+ Leg' }));
    await user.click(screen.getByRole('button', { name: 'Save leg' }));
    expect(screen.getByText('Enter both airport codes')).toBeTruthy();
    expect(api.syncLegs).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save leg' })).toBeTruthy();
  });

  it('shows the server error inline and keeps the form open', async () => {
    const user = userEvent.setup();
    api.syncLegs.mockRejectedValue(new Error('Leg 2 departs before the previous leg arrives'));
    renderList();
    await user.click(screen.getByRole('button', { name: 'Edit leg 2' }));
    fireEvent.change(screen.getByLabelText('Departs'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Arrives'), { target: { value: '09:30' } });
    await user.click(screen.getByRole('button', { name: 'Save leg' }));
    expect(await screen.findByText('Leg 2 departs before the previous leg arrives')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save leg' })).toBeTruthy();
  });

  it('deletes a leg after confirming', async () => {
    const user = userEvent.setup();
    const { onChanged } = renderList();
    await user.click(screen.getByRole('button', { name: 'Delete leg 2' }));
    expect(screen.getByText('Delete this leg?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.syncLegs).toHaveBeenCalledWith('trip-1', 'el-7', [leg1Payload]));
    expect(onChanged).toHaveBeenCalled();
  });

  it('cannot delete the only leg', () => {
    renderList({ legs: [legs[0]] });
    expect(screen.queryByRole('button', { name: 'Delete leg 1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit leg 1' })).toBeTruthy();
  });
});
