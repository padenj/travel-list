/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { RoomForm } from '../components/RoomForm';
import { tripApi } from '../api/tripApi';
import { LodgingRoom, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({ tripApi: { createRoom: vi.fn(), updateRoom: vi.fn(), createParticipant: vi.fn() } }));

const participants: TripParticipant[] = [
  { id: 'p1', displayName: 'Jeremy' } as TripParticipant,
  { id: 'p2', displayName: 'Grandma' } as TripParticipant,
];
const room: LodgingRoom = {
  id: 'r1', elementId: 'h1', position: 0, roomType: 'suite', beds: [{ type: 'king', count: 1 }], description: 'Ocean view',
  amenities: ['microwave'], otherAmenities: null, travelerIds: ['p1'],
};

function renderForm(props: Partial<React.ComponentProps<typeof RoomForm>> = {}) {
  return renderWithMantine(
    <RoomForm tripId="t1" stayId="h1" takenTravelerIds={new Set(['p2'])} participants={participants}
      onParticipantsChanged={() => {}} onSaved={() => {}} onCancel={() => {}} onDirtyChange={() => {}} {...props} />,
  );
}

describe('RoomForm', () => {
  beforeEach(() => {
    vi.mocked(tripApi.createRoom).mockReset();
    vi.mocked(tripApi.updateRoom).mockReset();
    vi.mocked(tripApi.createParticipant).mockReset();
  });
  afterEach(() => cleanup());

  it('creates a room with beds, room amenities and a traveler', async () => {
    vi.mocked(tripApi.createRoom).mockResolvedValue({} as any);
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await userEvent.click(screen.getByRole('button', { name: '+ Bed' }));
    await userEvent.type(screen.getByLabelText('Room description'), 'High floor');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Jetted tub' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Jeremy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.createRoom).toHaveBeenCalledWith('t1', 'h1', expect.objectContaining({
      description: 'High floor', amenities: ['jetted_tub'], travelerIds: ['p1'], beds: [expect.objectContaining({ count: 1 })],
    }));
  });

  it('only offers room amenities and no booking fields', () => {
    renderForm();
    expect(screen.getByRole('checkbox', { name: 'Microwave' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Pool' })).toBeNull();
    expect(screen.queryByLabelText('Hotel confirmation #')).toBeNull();
  });

  it('disables travelers already in another room', () => {
    renderForm();
    const grandma = screen.getByRole('checkbox', { name: 'Grandma (in another room)' }) as HTMLInputElement;
    expect(grandma.disabled).toBe(true);
  });

  it('updates an existing room', async () => {
    vi.mocked(tripApi.updateRoom).mockResolvedValue({} as any);
    const onSaved = vi.fn();
    renderForm({ room, onSaved });
    expect((screen.getByLabelText('Room description') as HTMLInputElement).value).toBe('Ocean view');
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateRoom).toHaveBeenCalledWith('t1', 'r1', expect.objectContaining({ roomType: 'suite', travelerIds: ['p1'] }));
  });

  it('creates a new traveler before saving and keeps them selected', async () => {
    vi.mocked(tripApi.createParticipant).mockResolvedValue({ id: 'p3', displayName: 'Ava' } as any);
    vi.mocked(tripApi.createRoom).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({} as any);
    const onParticipantsChanged = vi.fn();
    renderForm({ onParticipantsChanged });
    await userEvent.type(screen.getByLabelText('+ New traveler'), 'Ava');
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    expect(await screen.findByText('boom')).toBeTruthy();
    expect(onParticipantsChanged).toHaveBeenCalledWith([...participants, { id: 'p3', displayName: 'Ava' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(tripApi.createRoom).toHaveBeenCalledTimes(2));
    expect(tripApi.createParticipant).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tripApi.createRoom).mock.calls[1][2]).toMatchObject({ travelerIds: ['p3'] });
  });

  it('reports dirty after typing', async () => {
    const onDirtyChange = vi.fn();
    renderForm({ onDirtyChange });
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    await userEvent.type(screen.getByLabelText('Room description'), 'x');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
