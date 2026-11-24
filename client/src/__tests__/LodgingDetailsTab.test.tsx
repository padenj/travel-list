/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingDetailsTab } from '../components/LodgingDetailsTab';
import { tripApi } from '../api/tripApi';
import { TripElement } from '../types/trip';

vi.mock('../api/tripApi', () => ({ tripApi: { updateElement: vi.fn(), deleteElement: vi.fn() } }));

const element: TripElement = {
  id: 'h1', tripId: 't1', elementType: 'hotel', name: 'Hyatt Ziva', sortPosition: 0, createdAt: '', updatedAt: '', notes: 'Ocean view',
  hotelDetails: { address: '1 Beach Rd, Cabo', phone: '+1 555', website: 'https://hyatt.com', checkInDate: '2027-03-01', checkInTime: '15:00',
    checkOutDate: '2027-03-05', checkOutTime: '11:00', destinationId: 'd1', destinationName: 'Cabo' },
};

describe('LodgingDetailsTab', () => {
  beforeEach(() => { vi.mocked(tripApi.updateElement).mockReset(); vi.mocked(tripApi.deleteElement).mockReset(); });
  afterEach(() => cleanup());

  it('shows details with links', () => {
    renderWithMantine(<LodgingDetailsTab tripId="t1" element={element} destinations={[]} onChanged={() => {}} onDeleted={() => {}} onEditingChange={() => {}} />);
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
    renderWithMantine(<LodgingDetailsTab tripId="t1" element={element} destinations={[]} onChanged={onChanged} onDeleted={() => {}} onEditingChange={onEditingChange} />);
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
    renderWithMantine(<LodgingDetailsTab tripId="t1" element={element} destinations={[]} onChanged={() => {}} onDeleted={onDeleted} onEditingChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete stay' }));
    expect(screen.getByText('Delete this stay?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(tripApi.deleteElement).toHaveBeenCalledWith('t1', 'h1');
  });
});
