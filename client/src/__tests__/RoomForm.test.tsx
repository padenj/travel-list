/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { RoomForm } from '../components/RoomForm';
import { tripApi } from '../api/tripApi';
import { Booking, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({ tripApi: { createBooking: vi.fn(), updateBooking: vi.fn(), createParticipant: vi.fn() } }));

const participants: TripParticipant[] = [
  { id: 'p1', displayName: 'Jeremy' } as TripParticipant,
  { id: 'p2', displayName: 'Grandma' } as TripParticipant,
];
const otherRoom: Booking = {
  id: 'r0', tripId: 't1', confirmationNumber: 'H-1', advertisedPriceCash: null, advertisedPricePoints: null, loyaltyProgram: null,
  notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: ['p2'], currentConfirmationNumber: 'H-1',
  actualTotalCash: 0, actualTotalPoints: 0,
};

describe('RoomForm', () => {
  beforeEach(() => { vi.mocked(tripApi.createBooking).mockReset(); vi.mocked(tripApi.updateBooking).mockReset(); });
  afterEach(() => cleanup());

  it('creates a room with beds, amenities and coupons and no travelers', async () => {
    vi.mocked(tripApi.createBooking).mockResolvedValue({} as any);
    const onSaved = vi.fn();
    renderWithMantine(<RoomForm tripId="t1" stayId="h1" participants={participants} bookings={[otherRoom]}
      onParticipantsChanged={() => {}} onSaved={onSaved} onCancel={() => {}} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Booking site' }), 'Expedia');
    await userEvent.type(screen.getByLabelText('Site itinerary #'), '7231004');
    await userEvent.type(screen.getByLabelText('Hotel confirmation #'), 'H-88213');
    await userEvent.type(screen.getByLabelText('Advertised total (cash)'), '1612');
    await userEvent.click(screen.getByLabelText('Includes taxes & fees'));
    await userEvent.click(screen.getByRole('button', { name: '+ Bed' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pool' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Coupon' }));
    await userEvent.type(screen.getByLabelText('Coupon code 1'), 'EXP10');
    await userEvent.type(screen.getByLabelText('Coupon savings $ 1'), '42.18');
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.createBooking).toHaveBeenCalledWith('t1', expect.objectContaining({
      elementIds: ['h1'], travelerIds: [], bookingSite: 'Expedia', siteItineraryNumber: '7231004', confirmationNumber: 'H-88213',
      advertisedPriceCash: 1612, advertisedIncludesTaxes: true,
      room: expect.objectContaining({ beds: [{ type: 'king', count: 1 }], amenities: ['pool'] }),
      coupons: [{ code: 'EXP10', savingsCash: 42.18, savingsPoints: null, notes: null }],
    }));
  }, 20000);

  it('disables travelers already in another room of the stay', () => {
    renderWithMantine(<RoomForm tripId="t1" stayId="h1" participants={participants} bookings={[otherRoom]}
      onParticipantsChanged={() => {}} onSaved={() => {}} onCancel={() => {}} />);
    const grandma = screen.getByRole('checkbox', { name: 'Grandma (in room H-1)' }) as HTMLInputElement;
    expect(grandma.disabled).toBe(true);
  });

  it('shows validation errors inline and keeps the form', async () => {
    renderWithMantine(<RoomForm tripId="t1" stayId="h1" participants={[]} bookings={[]}
      onParticipantsChanged={() => {}} onSaved={() => {}} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Coupon' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    expect(await screen.findByText('Coupon code is required')).toBeTruthy();
    expect(tripApi.createBooking).not.toHaveBeenCalled();
  });

  it('updates an existing room', async () => {
    vi.mocked(tripApi.updateBooking).mockResolvedValue({} as any);
    renderWithMantine(<RoomForm tripId="t1" stayId="h1" participants={participants} bookings={[otherRoom]} booking={otherRoom}
      onParticipantsChanged={() => {}} onSaved={() => {}} onCancel={() => {}} />);
    expect((screen.getByRole('checkbox', { name: 'Grandma' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(tripApi.updateBooking).toHaveBeenCalledWith('t1', 'r0', expect.objectContaining({ travelerIds: ['p2'] })));
  });
});
