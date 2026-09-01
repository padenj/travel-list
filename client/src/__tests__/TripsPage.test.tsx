/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listTrips: vi.fn(),
    createTrip: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { TripsPage } from '../pages/TripsPage';

describe('TripsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a create trip button', async () => {
    (tripApi.listTrips as any).mockResolvedValue([]);

    render(<TripsPage />);

    expect(await screen.findByRole('button', { name: /create trip/i })).toBeTruthy();
  });

  it('creates a trip from the inline create form', async () => {
    (tripApi.listTrips as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'trip-1',
          familyId: 'fam-1',
          name: 'Cabo',
          startDate: '2026-09-01',
          endDate: '2026-09-08',
          createdAt: '',
          updatedAt: '',
        },
      ]);
    (tripApi.createTrip as any).mockResolvedValue({
      id: 'trip-1',
      familyId: 'fam-1',
      name: 'Cabo',
      startDate: '2026-09-01',
      endDate: '2026-09-08',
      createdAt: '',
      updatedAt: '',
    });

    render(<TripsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /create trip/i }));
    fireEvent.change(screen.getByPlaceholderText(/trip name/i), { target: { value: 'Cabo' } });
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-09-08' } });
    fireEvent.click(screen.getByRole('button', { name: /save trip/i }));

    await waitFor(() => {
      expect(tripApi.createTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Cabo',
          startDate: '2026-09-01',
          endDate: '2026-09-08',
        })
      );
    });
    expect(await screen.findByText('Cabo')).toBeTruthy();
  });
});
