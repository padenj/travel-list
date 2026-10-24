/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    getTrip: vi.fn(),
    listElements: vi.fn(),
    listParticipants: vi.fn(),
    createParticipant: vi.fn(),
    deleteParticipant: vi.fn(),
    createElement: vi.fn(),
    updateElement: vi.fn(),
    lookupFlightAutofill: vi.fn(),
    syncLegs: vi.fn(),
    listBookings: vi.fn(),
    createBooking: vi.fn(),
    listBookingTransactions: vi.fn(),
    addBookingTransaction: vi.fn(),
    deleteBookingTransaction: vi.fn(),
    listSeatsForLeg: vi.fn(),
    assignSeat: vi.fn(),
    removeSeat: vi.fn(),
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
    (tripApi.listParticipants as any).mockResolvedValue([]);
    (tripApi.listBookings as any).mockResolvedValue([]);
    (tripApi.listBookingTransactions as any).mockResolvedValue([]);
    (tripApi.listSeatsForLeg as any).mockResolvedValue([]);
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

  it('hides deprecated flat flight booking fields and omits them from flight creation payload', async () => {
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

    expect(screen.queryByLabelText(/booking or itinerary reference/i)).toBeNull();
    expect(screen.queryByLabelText(/^price cash$/i)).toBeNull();
    expect(screen.queryByLabelText(/^price points$/i)).toBeNull();
    expect(screen.queryByLabelText(/^confirmation number$/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /save element/i }));

    await waitFor(() => {
      expect(tripApi.createElement).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({
          elementType: 'flight',
          name: 'Southwest WN123',
          typeSpecificData: expect.objectContaining({
            legs: [
              expect.objectContaining({
                flightNumber: 'WN123',
                departureDatetime: '2026-09-12T00:00',
                arrivalDatetime: '2026-09-12T00:00',
              }),
            ],
          }),
        })
      );
    });
  });

  it('auto-generates flight names from auto-filled airports until manually edited', async () => {
    (tripApi.lookupFlightAutofill as any).mockResolvedValue({
      airlineCode: 'WN',
      flightNumber: '722',
      flightDate: '2026-08-29',
      departureAirport: 'DEN',
      arrivalAirport: 'SJD',
      departureDatetime: '2026-08-29T15:10:00.000Z',
      arrivalDatetime: '2026-08-29T18:05:00.000Z',
      statusText: 'Arrived',
      sourceUrl: 'https://example.com/flight',
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /add element/i }));
    fireEvent.change(screen.getByLabelText(/flight date/i), { target: { value: '2026-08-29' } });
    fireEvent.change(screen.getByLabelText(/airline code/i), { target: { value: 'WN' } });
    fireEvent.change(screen.getByLabelText(/flight number/i), { target: { value: '722' } });
    fireEvent.click(screen.getByRole('button', { name: /look up flight details/i }));

    await waitFor(() => {
      expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('DEN → SJD');
    });

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Custom name' } });
    fireEvent.click(screen.getByRole('button', { name: /look up flight details/i }));

    await waitFor(() => {
      expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Custom name');
    });
  });

  it('renders participants, seat grid, and booking card for flights using trip participants', async () => {
    (tripApi.listParticipants as any).mockResolvedValue([
      {
        id: 'p-1',
        tripId: 'trip-1',
        displayName: 'Taylor',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    (tripApi.listElements as any).mockResolvedValueOnce([
      {
        id: 'el-9',
        tripId: 'trip-1',
        elementType: 'flight',
        name: 'Delta 45',
        bookingReference: 'LEGACY-REF',
        priceCash: 123.45,
        sortPosition: 0,
        createdAt: '',
        updatedAt: '',
        legs: [
          {
            id: 'leg-1',
            departureDatetime: '2026-09-01T00:00:00Z',
            flightNumber: 'DL45',
          },
        ],
      },
    ]);

    renderPage();

    expect(await screen.findByRole('heading', { name: /travelers/i })).toBeTruthy();
    expect(await screen.findByText('Taylor')).toBeTruthy();
    expect(await screen.findByLabelText(/taylor seat/i)).toBeTruthy();
    expect(await screen.findByRole('heading', { name: /bookings/i })).toBeTruthy();
    expect(await screen.findByText(/no bookings yet for this element/i)).toBeTruthy();
    expect(screen.queryByText('LEGACY-REF')).toBeNull();
    expect(screen.queryByText('$123.45')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /look up flight details/i }));

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
                departureDatetime: '2026-08-29T15:10',
                arrivalDatetime: '2026-08-29T18:05',
              }),
            ],
          }),
        })
      );
    });
  });
  it('creates a two-leg flight with a connection', async () => {
    (tripApi.createElement as any).mockResolvedValue({ id: 'el-5', tripId: 'trip-1', elementType: 'flight', name: 'DEN → DAL → SJD', sortPosition: 0, createdAt: '', updatedAt: '' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /add element/i }));
    fireEvent.change(screen.getByLabelText(/from \(airport/i), { target: { value: 'DEN' } });
    fireEvent.change(screen.getByLabelText(/to \(airport/i), { target: { value: 'DAL' } });
    fireEvent.change(screen.getByLabelText(/flight date/i), { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: /add connecting flight/i }));
    const froms = screen.getAllByLabelText(/from \(airport/i);
    const tos = screen.getAllByLabelText(/to \(airport/i);
    fireEvent.change(froms[1], { target: { value: 'DAL' } });
    fireEvent.change(tos[1], { target: { value: 'SJD' } });

    await waitFor(() => expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe('DEN → DAL → SJD'));
    fireEvent.click(screen.getByRole('button', { name: /save element/i }));

    await waitFor(() => {
      expect(tripApi.createElement).toHaveBeenCalledWith('trip-1', expect.objectContaining({
        typeSpecificData: expect.objectContaining({
          legs: [
            expect.objectContaining({ legOrder: 1, departureAirport: 'DEN', arrivalAirport: 'DAL' }),
            expect.objectContaining({ legOrder: 2, departureAirport: 'DAL', arrivalAirport: 'SJD' }),
          ],
        }),
      }));
    });
  });

  it('lists every leg of a flight with its layover and edits legs through syncLegs', async () => {
    (tripApi.listElements as any).mockResolvedValue([
      {
        id: 'el-7', tripId: 'trip-1', elementType: 'flight', name: 'DEN → DAL → SJD', sortPosition: 0, createdAt: '', updatedAt: '',
        legs: [
          { id: 'leg-1', elementId: 'el-7', legOrder: 1, departureAirport: 'DEN', departureDatetime: '2026-11-10T08:00', arrivalAirport: 'DAL', arrivalDatetime: '2026-11-10T10:00', airline: 'WN', flightNumber: '100', layoverMinutesAfter: 135, createdAt: '', updatedAt: '' },
          { id: 'leg-2', elementId: 'el-7', legOrder: 2, departureAirport: 'DAL', departureDatetime: '2026-11-10T12:15', arrivalAirport: 'SJD', arrivalDatetime: '2026-11-10T14:00', airline: 'WN', flightNumber: '200', createdAt: '', updatedAt: '' },
        ],
      },
    ]);
    (tripApi.updateElement as any).mockResolvedValue({});
    (tripApi.syncLegs as any).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText(/DEN → DAL/, { selector: '.flight-leg-summary strong' })).toBeTruthy();
    expect(screen.getByText(/layover.*2h 15m/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /view\/edit/i }));
    fireEvent.change(screen.getAllByLabelText(/flight number/i)[1], { target: { value: '201' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(tripApi.syncLegs).toHaveBeenCalledWith('trip-1', 'el-7', [
        expect.objectContaining({ id: 'leg-1', flightNumber: '100' }),
        expect.objectContaining({ id: 'leg-2', flightNumber: '201', departureAirport: 'DAL', arrivalAirport: 'SJD' }),
      ]);
    });
  });

  it('hides the date range when a trip has no dates', async () => {
    (tripApi.getTrip as any).mockResolvedValue({ id: 'trip-1', familyId: 'fam-1', name: 'Cabo', createdAt: '', updatedAt: '' });
    renderPage();
    await screen.findByRole('button', { name: /add element/i });
    expect(screen.queryByText(/ to /)).toBeNull();
  });
});
