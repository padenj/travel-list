/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    getTrip: vi.fn(),
    listElements: vi.fn(),
    createElement: vi.fn(),
    updateElement: vi.fn(),
    lookupFlightAutofill: vi.fn(),
    listConfirmations: vi.fn(),
    addConfirmation: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { TripDetailPage } from '../pages/TripDetailPage';

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/trips/trip-1']}>
      <Routes>
        <Route path="/trips/:tripId" element={<TripDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TripDetailPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.getTrip as any).mockResolvedValue({
      id: 'trip-1',
      familyId: 'fam-1',
      name: 'Cabo',
      startDate: '2026-09-01',
      endDate: '2026-09-08',
      createdAt: '',
      updatedAt: '',
    });
    (tripApi.listElements as any).mockResolvedValue([]);
    (tripApi.listConfirmations as any).mockResolvedValue([]);
  });

  it('shows add element action when trip has no elements', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /add element/i })).toBeTruthy();
  });

  it('creates a new element from the trip detail page', async () => {
    (tripApi.createElement as any).mockResolvedValue({
      id: 'el-1',
      tripId: 'trip-1',
      elementType: 'flight',
      name: 'Southwest flight',
      sortPosition: 0,
      createdAt: '',
      updatedAt: '',
    });
    (tripApi.listElements as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'el-1',
          tripId: 'trip-1',
          elementType: 'flight',
          name: 'Southwest flight',
          sortPosition: 0,
          createdAt: '',
          updatedAt: '',
        },
      ]);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /add element/i }));
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'flight' } });
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Southwest flight' } });
    fireEvent.change(screen.getByLabelText(/flight date/i), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /save element/i }));

    await waitFor(() => {
      expect(tripApi.createElement).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ elementType: 'flight', name: 'Southwest flight' })
      );
    });
    expect(await screen.findByText('Southwest flight')).toBeTruthy();
  });

  it('renders a real view edit button for existing elements', async () => {
    (tripApi.listElements as any).mockResolvedValueOnce([
      {
        id: 'el-9',
        tripId: 'trip-1',
        elementType: 'flight',
        name: 'Delta 45',
        sortPosition: 0,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    renderPage();

    expect(await screen.findByRole('button', { name: /view\/edit/i })).toBeTruthy();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it('submits flight-specific date, pricing, and confirmation fields', async () => {
    (tripApi.createElement as any).mockResolvedValue({
      id: 'el-2',
      tripId: 'trip-1',
      elementType: 'flight',
      name: 'Southwest WN123',
      sortPosition: 0,
      createdAt: '',
      updatedAt: '',
    });
    (tripApi.listElements as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'el-2',
          tripId: 'trip-1',
          elementType: 'flight',
          name: 'Southwest WN123',
          sortPosition: 0,
          createdAt: '',
          updatedAt: '',
        },
      ]);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /add element/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Southwest WN123' } });
    fireEvent.change(screen.getByLabelText(/flight date/i), { target: { value: '2026-09-12' } });
    fireEvent.change(screen.getByLabelText(/flight number/i), { target: { value: 'WN123' } });
    fireEvent.change(screen.getByLabelText(/booking or itinerary reference/i), { target: { value: 'Expedia itinerary # 9999' } });
    fireEvent.change(screen.getByLabelText(/price cash/i), { target: { value: '322.45' } });
    fireEvent.change(screen.getByLabelText(/price points/i), { target: { value: '15400' } });
    fireEvent.change(screen.getByLabelText(/confirmation number/i), { target: { value: 'SWCONF-77' } });
    fireEvent.click(screen.getByRole('button', { name: /save element/i }));

    await waitFor(() => {
      expect(tripApi.createElement).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({
          elementType: 'flight',
          name: 'Southwest WN123',
          bookingReference: 'Expedia itinerary # 9999',
          priceCash: 322.45,
          pricePoints: 15400,
          typeSpecificData: expect.objectContaining({
            legs: [
              expect.objectContaining({
                flightNumber: 'WN123',
                confirmationNumber: 'SWCONF-77',
                departureDatetime: '2026-09-12T00:00:00Z',
                arrivalDatetime: '2026-09-12T00:00:00Z',
              }),
            ],
          }),
        })
      );
    });
  });

  it('autofills flight details from the lookup endpoint', async () => {
    (tripApi.lookupFlightAutofill as any).mockResolvedValue({
      airlineCode: 'WN',
      flightNumber: '722',
      flightDate: '2026-08-29',
      departureAirport: 'DEN',
      arrivalAirport: 'SJD',
      departureDatetime: '2026-08-29T15:10:00.000Z',
      arrivalDatetime: '2026-08-29T18:05:00.000Z',
      statusText: 'Arrived',
      sourceUrl: 'https://www.flightstats.com/v2/flight-tracker/WN/722?year=2026&month=8&date=29',
    });
    (tripApi.createElement as any).mockResolvedValue({
      id: 'el-3',
      tripId: 'trip-1',
      elementType: 'flight',
      name: 'Southwest WN722',
      sortPosition: 0,
      createdAt: '',
      updatedAt: '',
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /add element/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Southwest WN722' } });
    fireEvent.change(screen.getByLabelText(/flight date/i), { target: { value: '2026-08-29' } });
    fireEvent.change(screen.getByLabelText(/airline code/i), { target: { value: 'WN' } });
    fireEvent.change(screen.getByLabelText(/flight number/i), { target: { value: '722' } });
    fireEvent.click(screen.getByRole('button', { name: /auto-fill flight details/i }));

    await waitFor(() => {
      expect(tripApi.lookupFlightAutofill).toHaveBeenCalledWith('trip-1', {
        airlineCode: 'WN',
        flightNumber: '722',
        flightDate: '2026-08-29',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /save element/i }));

    await waitFor(() => {
      expect(tripApi.createElement).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({
          typeSpecificData: expect.objectContaining({
            legs: [
              expect.objectContaining({
                departureAirport: 'DEN',
                arrivalAirport: 'SJD',
                departureDatetime: '2026-08-29T15:10:00.000Z',
                arrivalDatetime: '2026-08-29T18:05:00.000Z',
              }),
            ],
          }),
        })
      );
    });
  });
});
