/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingDetailsTab } from '../components/LodgingDetailsTab';
import { tripApi } from '../api/tripApi';
import { Booking, TripElement } from '../types/trip';

vi.mock('../api/tripApi', () => ({ tripApi: { updateElement: vi.fn(), deleteElement: vi.fn() } }));

const element: TripElement = {
  id: 'h1', tripId: 't1', elementType: 'hotel', name: 'Hyatt Ziva', sortPosition: 0, createdAt: '', updatedAt: '', notes: 'Ocean view',
  hotelDetails: { address: '1 Beach Rd, Cabo', phone: '+1 555', website: 'https://hyatt.com', checkInDate: '2027-03-01', checkInTime: '15:00',
    checkOutDate: '2027-03-05', checkOutTime: '11:00', destinationId: 'd1', destinationName: 'Cabo',
    amenities: ['pool'], otherAmenities: 'Swim-up bar' },
};

const booking: Booking = {
  id: 'b1', tripId: 't1', confirmationNumber: 'H-80000', advertisedPriceCash: 1612, advertisedPricePoints: null,
  loyaltyProgram: 'World of Hyatt', notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: [],
  currentConfirmationNumber: 'H-88213', actualTotalCash: 1430, actualTotalPoints: 0,
  bookingSite: 'Expedia', siteItineraryNumber: '7231004', advertisedIncludesTaxes: true, advertisedRateCash: 403,
  dueAtBookingCash: 1430, dueLaterCash: 182.4, dueLaterNotes: 'Resort fee', refundability: 'nonrefundable',
  cancellationPolicy: 'No refunds', coupons: [{ id: 'c1', code: 'EXP10', savingsCash: 10, savingsPoints: null, notes: null }],
};

function renderTab(props: Partial<React.ComponentProps<typeof LodgingDetailsTab>> = {}) {
  return renderWithMantine(
    <LodgingDetailsTab tripId="t1" element={element} booking={booking} destinations={[]} onChanged={() => {}} onDeleted={() => {}}
      onEditingChange={() => {}} onDirtyChange={() => {}} {...props} />,
  );
}

describe('LodgingDetailsTab', () => {
  beforeEach(() => { vi.mocked(tripApi.updateElement).mockReset(); vi.mocked(tripApi.deleteElement).mockReset(); });
  afterEach(() => cleanup());

  it('shows details with links', () => {
    renderWithMantine(<LodgingDetailsTab tripId="t1" element={element} booking={booking} destinations={[]} onChanged={() => {}} onDeleted={() => {}} onEditingChange={() => {}} onDirtyChange={() => {}} />);
    expect(screen.getByRole('link', { name: 'Open in Maps' }).getAttribute('href'))
      .toBe('https://www.google.com/maps/search/?api=1&query=1%20Beach%20Rd%2C%20Cabo');
    expect(screen.getByRole('link', { name: '+1 555' }).getAttribute('href')).toBe('tel:+1 555');
    const site = screen.getByRole('link', { name: 'https://hyatt.com' });
    expect(site.getAttribute('target')).toBe('_blank');
    expect(screen.getByText(/Mar 1, 3:00 PM → Mar 5, 11:00 AM · 4 nights/)).toBeTruthy();
    expect(screen.getByText('Cabo')).toBeTruthy();
    expect(screen.getByText('Ocean view')).toBeTruthy();
  });

  it('edits and saves', async () => {
    vi.mocked(tripApi.updateElement).mockResolvedValue({} as any);
    const onChanged = vi.fn();
    const onEditingChange = vi.fn();
    renderWithMantine(<LodgingDetailsTab tripId="t1" element={element} booking={booking} destinations={[]} onChanged={onChanged} onDeleted={() => {}} onEditingChange={onEditingChange} onDirtyChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit stay' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    const name = screen.getByLabelText('Hotel name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Hyatt');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(tripApi.updateElement).toHaveBeenCalledWith('t1', 'h1', expect.objectContaining({ name: 'Hyatt' }));
  });

  it('confirms before deleting', async () => {
    vi.mocked(tripApi.deleteElement).mockResolvedValue(undefined as any);
    const onDeleted = vi.fn();
    renderWithMantine(<LodgingDetailsTab tripId="t1" element={element} booking={booking} destinations={[]} onChanged={() => {}} onDeleted={onDeleted} onEditingChange={() => {}} onDirtyChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete stay' }));
    expect(screen.getByText('Delete this stay?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(tripApi.deleteElement).toHaveBeenCalledWith('t1', 'h1');
  });

  it('shows booking, price, payment, cancellation, amenities and coupons', () => {
    renderTab();
    expect(screen.getByText('Expedia 7231004 · Hotel H-88213 · orig H-80000')).toBeTruthy();
    expect(screen.getByText('Loyalty: World of Hyatt')).toBeTruthy();
    expect(screen.getByText('Adv $403.00/nt · $1,612.00 total incl. taxes')).toBeTruthy();
    expect(screen.getByText('Total $1,612.40 · At booking $1,430.00 · At check-in $182.40 (Resort fee)')).toBeTruthy();
    expect(screen.getByText("What you'll pay")).toBeTruthy();
    expect(screen.getByText('Non-refundable')).toBeTruthy();
    expect(screen.getByText('No refunds')).toBeTruthy();
    expect(screen.getByText('Pool · Swim-up bar')).toBeTruthy();
    expect(screen.getByText('Coupons: EXP10 −$10.00')).toBeTruthy();
  });

  it('renders without a booking', () => {
    renderTab({ booking: null });
    expect(screen.getByText(/Mar 1, 3:00 PM/)).toBeTruthy();
    expect(screen.queryByText(/At booking/)).toBeNull();
  });

  it('reports dirty only after a change', async () => {
    const onDirtyChange = vi.fn();
    renderTab({ onDirtyChange });
    await userEvent.click(screen.getByRole('button', { name: 'Edit stay' }));
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    await userEvent.type(screen.getByLabelText('Hotel name'), ' X');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('saves the booking with the stay', async () => {
    vi.mocked(tripApi.updateElement).mockResolvedValue({} as any);
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Edit stay' }));
    const due = screen.getByLabelText('Due at check-in');
    await userEvent.clear(due);
    await userEvent.type(due, '200');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(tripApi.updateElement).toHaveBeenCalled());
    const payload = vi.mocked(tripApi.updateElement).mock.calls[0][2] as any;
    expect(payload).not.toHaveProperty('elementType');
    expect(payload.booking).toMatchObject({ dueAtBookingCash: 1412.4, dueLaterCash: 200, payAt: 'booking', siteItineraryNumber: '7231004' });
  });
});
