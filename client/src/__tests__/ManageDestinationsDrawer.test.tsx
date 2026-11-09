/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({ tripApi: { getTrip: vi.fn() } }));
vi.mock('../components/TripPackingSection', () => ({
  default: ({ trip, onOpenList, zIndex }: any) => (
    <div>
      <span>{`packing for ${trip.name} at ${zIndex}`}</span>
      <button onClick={() => onOpenList?.()}>open a list</button>
    </div>
  ),
}));

import { tripApi } from '../api/tripApi';
import ManageDestinationsDrawer from '../components/ManageDestinationsDrawer';

const trip = { id: 't1', familyId: 'f1', name: 'Spring Break', startDate: null, endDate: null, createdAt: '', updatedAt: '' };

describe('ManageDestinationsDrawer', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads the trip and shows its destinations', async () => {
    (tripApi.getTrip as any).mockResolvedValue(trip);
    renderWithMantine(<ManageDestinationsDrawer opened tripId="t1" onClose={vi.fn()} />);
    expect(await screen.findByText('packing for Spring Break at 3100')).toBeTruthy();
    expect(screen.getByText('Spring Break destinations')).toBeTruthy();
    expect(tripApi.getTrip).toHaveBeenCalledWith('t1');
  });

  it('closes when a list is opened', async () => {
    (tripApi.getTrip as any).mockResolvedValue(trip);
    const onClose = vi.fn();
    renderWithMantine(<ManageDestinationsDrawer opened tripId="t1" onClose={onClose} />);
    await userEvent.click(await screen.findByRole('button', { name: 'open a list' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says so when the trip cannot be loaded', async () => {
    (tripApi.getTrip as any).mockRejectedValue(new Error('Trip not found'));
    renderWithMantine(<ManageDestinationsDrawer opened tripId="t1" onClose={vi.fn()} />);
    expect(await screen.findByText("Couldn't load this trip.")).toBeTruthy();
  });

  it('loads nothing while closed', () => {
    renderWithMantine(<ManageDestinationsDrawer opened={false} tripId="t1" onClose={vi.fn()} />);
    expect(tripApi.getTrip).not.toHaveBeenCalled();
  });
});
