/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingRoomsTab } from '../components/LodgingRoomsTab';
import { tripApi } from '../api/tripApi';
import { LodgingRoom, TripElement, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: { createRoom: vi.fn(), updateRoom: vi.fn(), deleteRoom: vi.fn(), createParticipant: vi.fn() },
}));

const participants = [{ id: 'p1', displayName: 'Jeremy' }, { id: 'p2', displayName: 'Grandma' }] as TripParticipant[];
const room: LodgingRoom = {
  id: 'r1', elementId: 'h1', position: 0, roomType: 'suite', beds: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }],
  description: 'Ocean view', amenities: ['microwave', 'jetted_tub'], otherAmenities: 'Espresso machine', travelerIds: ['p1'],
};

function stayWith(rooms: LodgingRoom[]): TripElement {
  return {
    id: 'h1', tripId: 't1', elementType: 'hotel', name: 'Hyatt', sortPosition: 0, createdAt: '', updatedAt: '', rooms,
    hotelDetails: { address: null, phone: null, website: null, checkInDate: '2027-03-01', checkInTime: null, checkOutDate: '2027-03-05', checkOutTime: null, destinationId: null },
  };
}

function renderTab(rooms: LodgingRoom[], props: Partial<React.ComponentProps<typeof LodgingRoomsTab>> = {}) {
  return renderWithMantine(
    <LodgingRoomsTab tripId="t1" stay={stayWith(rooms)} participants={participants} onParticipantsChanged={() => {}}
      onRoomsChanged={() => {}} onEditingChange={() => {}} onDirtyChange={() => {}} {...props} />,
  );
}

describe('LodgingRoomsTab', () => {
  beforeEach(() => vi.mocked(tripApi.deleteRoom).mockReset());
  afterEach(() => cleanup());

  it('shows an empty state', () => {
    renderTab([]);
    expect(screen.getByText('No rooms yet for this stay')).toBeTruthy();
  });

  it('lists rooms with travelers, description and amenities', () => {
    renderTab([room]);
    expect(screen.getByText('Suite · 1 × King + 1 × Sofa bed')).toBeTruthy();
    expect(screen.getByText('Jeremy')).toBeTruthy();
    expect(screen.getByText('Ocean view')).toBeTruthy();
    expect(screen.getByText('Microwave · Jetted tub · Espresso machine')).toBeTruthy();
    expect(screen.getByText('Not in a room: Grandma')).toBeTruthy();
    expect(screen.queryByText(/transaction/i)).toBeNull();
  });

  it('opens the form initially when asked', () => {
    renderTab([], { initialFormOpen: true });
    expect(screen.getByRole('button', { name: 'Save room' })).toBeTruthy();
  });

  it('marks travelers in other rooms as taken in the add form', async () => {
    renderTab([room]);
    await userEvent.click(screen.getByRole('button', { name: '+ Room' }));
    expect((screen.getByRole('checkbox', { name: 'Jeremy (in another room)' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('does not mark a room\'s own travelers as taken when editing it', async () => {
    renderTab([room]);
    await userEvent.click(screen.getByRole('button', { name: 'Edit room' }));
    expect((screen.getByRole('checkbox', { name: 'Jeremy' }) as HTMLInputElement).checked).toBe(true);
  });

  it('confirms before deleting a room', async () => {
    vi.mocked(tripApi.deleteRoom).mockResolvedValue(undefined as any);
    const onRoomsChanged = vi.fn();
    renderTab([room], { onRoomsChanged });
    await userEvent.click(screen.getByRole('button', { name: 'Delete room' }));
    expect(screen.getByText('Delete this room?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onRoomsChanged).toHaveBeenCalled());
    expect(tripApi.deleteRoom).toHaveBeenCalledWith('t1', 'r1');
  });

  it('reports editing and dirty state', async () => {
    const onEditingChange = vi.fn();
    const onDirtyChange = vi.fn();
    renderTab([room], { onEditingChange, onDirtyChange });
    await userEvent.click(screen.getByRole('button', { name: '+ Room' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    await userEvent.type(screen.getByLabelText('Room description'), 'x');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });
});
