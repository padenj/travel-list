/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    getTrip: vi.fn(),
    listElements: vi.fn(),
    listParticipants: vi.fn(),
    listBookings: vi.fn(),
    createElement: vi.fn(),
    updateElement: vi.fn(),
    deleteElement: vi.fn(),
    syncLegs: vi.fn(),
  },
}));

vi.mock('../components/TripParticipantsPanel', () => ({
  TripParticipantsPanel: () => <div>participants panel</div>,
}));
vi.mock('../components/BookingCard', () => ({
  BookingCard: ({ elementId }: { elementId: string }) => <div>booking card {elementId}</div>,
}));
vi.mock('../components/FlightSeatGrid', () => ({
  FlightSeatGrid: ({ legId }: { legId: string }) => <div>seat grid {legId}</div>,
}));
const mockLeg = {
  flightCode: 'WN123', date: '2026-09-12', departureTime: '08:00', arrivalTime: '11:00', arrivalDayOffset: 0,
  departureAirport: 'DEN', arrivalAirport: 'SJD', checkPriceUrl: '',
};

vi.mock('../components/FlightLegsEditor', () => ({
  FlightLegsEditor: ({ legs, onChange }: { legs: any[]; onChange: (legs: any[]) => void }) => (
    <div>
      <span>legs in editor: {legs.length}</span>
      <button type="button" onClick={() => onChange([{ ...mockLeg }])}>mock fill leg</button>
      <button
        type="button"
        onClick={() =>
          onChange([
            { ...mockLeg, flightCode: 'WN100', date: '2026-11-10', departureTime: '08:00', arrivalTime: '10:00', arrivalAirport: 'DAL' },
            { ...mockLeg, flightCode: 'WN200', date: '2026-11-10', departureTime: '12:15', arrivalTime: '14:00', departureAirport: 'DAL' },
          ])
        }
      >
        mock two legs
      </button>
    </div>
  ),
}));

import { tripApi } from '../api/tripApi';
import { TripDetailPage } from '../pages/TripDetailPage';

const api = tripApi as any;

const flightEl = (over: any = {}) => ({
  id: 'el-1',
  tripId: 'trip-1',
  elementType: 'flight',
  name: 'Delta 45',
  sortPosition: 0,
  createdAt: '',
  updatedAt: '',
  legs: [
    {
      id: 'leg-1',
      elementId: 'el-1',
      legOrder: 1,
      departureAirport: 'DEN',
      departureDatetime: '2026-09-01T08:00',
      arrivalAirport: 'SJD',
      arrivalDatetime: '2026-09-01T11:00',
      airline: 'DL',
      flightNumber: '45',
      createdAt: '',
      updatedAt: '',
    },
  ],
  ...over,
});

const twoLegFlight = () =>
  flightEl({
    id: 'el-7',
    name: 'DEN → DAL → SJD',
    legs: [
      { id: 'leg-1', elementId: 'el-7', legOrder: 1, departureAirport: 'DEN', departureDatetime: '2026-11-10T08:00', arrivalAirport: 'DAL', arrivalDatetime: '2026-11-10T10:00', airline: 'WN', flightNumber: '100', layoverMinutesAfter: 135, createdAt: '', updatedAt: '' },
      { id: 'leg-2', elementId: 'el-7', legOrder: 2, departureAirport: 'DAL', departureDatetime: '2026-11-10T12:15', arrivalAirport: 'SJD', arrivalDatetime: '2026-11-10T14:00', airline: 'WN', flightNumber: '200', createdAt: '', updatedAt: '' },
    ],
  });

function renderPage() {
  return renderWithMantine(
    <MemoryRouter initialEntries={['/trips/trip-1']}>
      <Routes>
        <Route path="/trips/:tripId" element={<TripDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TripDetailPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.resetAllMocks();
    api.getTrip.mockResolvedValue({
      id: 'trip-1',
      familyId: 'fam-1',
      name: 'Cabo',
      tripType: 'vacation',
      startDate: '2026-08-29',
      endDate: '2026-09-05',
      createdAt: '',
      updatedAt: '',
    });
    api.listElements.mockResolvedValue([]);
    api.listParticipants.mockResolvedValue([]);
    api.listBookings.mockResolvedValue([]);
  });

  it('renders the compact page with header, travelers and flight rows', async () => {
    const p = (id: string, displayName: string) => ({ id, tripId: 'trip-1', displayName, createdAt: '', updatedAt: '' });
    api.listParticipants.mockResolvedValue([p('p1', 'Taylor'), p('p2', 'Sam'), p('p3', 'Alex'), p('p4', 'Jo')]);
    api.listElements.mockResolvedValue([flightEl()]);
    api.listBookings.mockResolvedValue([
      {
        id: 'b-1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 500, advertisedPricePoints: null,
        loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '', elementIds: ['el-1'], travelerIds: [],
        currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
      },
    ]);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Cabo' })).toBeTruthy();
    expect(screen.getByText('vacation')).toBeTruthy();
    expect(screen.getByText(/Aug 29 – Sep 5, 2026 · 7 nights/)).toBeTruthy();
    expect(screen.getByText('Taylor')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.queryByText('Jo')).toBeNull();
    expect(screen.getByText('+1')).toBeTruthy();
    const flights = screen.getByRole('region', { name: 'Flights' });
    expect(within(flights).getByText('Delta 45')).toBeTruthy();
    expect(within(flights).getByText('ABC123')).toBeTruthy();
  });

  it('shows an add-first-flight button when there are no elements', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Add your first flight' })).toBeTruthy();
  });

  it('hides date text when the trip has no dates', async () => {
    api.getTrip.mockResolvedValue({ id: 'trip-1', familyId: 'fam-1', name: 'Cabo', createdAt: '', updatedAt: '' });
    renderPage();
    await screen.findByRole('heading', { name: 'Cabo' });
    expect(screen.queryByText(/night/i)).toBeNull();
    expect(screen.queryByText(/ – /)).toBeNull();
  });

  it('shows a notice for hidden non-flight elements', async () => {
    const hotel = { id: 'h-1', tripId: 'trip-1', elementType: 'hotel', name: 'Resort', sortPosition: 1, createdAt: '', updatedAt: '' };
    api.listElements.mockResolvedValue([flightEl(), hotel]);
    renderPage();
    expect(await screen.findByText('1 other element hidden until its section is built')).toBeTruthy();
    cleanup();
    api.listElements.mockResolvedValue([flightEl(), hotel, { ...hotel, id: 'h-2' }]);
    renderPage();
    expect(await screen.findByText('2 other elements hidden until their sections are built')).toBeTruthy();
  });

  it('creates a flight without a name, closes the dialog and reloads elements', async () => {
    const user = userEvent.setup();
    api.createElement.mockResolvedValue({ id: 'el-2' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add flight' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add flight' });
    expect(within(dialog).queryByLabelText('Name')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'mock fill leg' }));
    const callsBefore = api.listElements.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Save flight' }));

    await waitFor(() =>
      expect(api.createElement).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({
          elementType: 'flight',
          typeSpecificData: {
            legs: [expect.objectContaining({
              legOrder: 1, airline: 'WN', flightNumber: '123', departureAirport: 'DEN', arrivalAirport: 'SJD',
              departureDatetime: '2026-09-12T08:00', arrivalDatetime: '2026-09-12T11:00',
            })],
          },
        })
      )
    );
    expect(api.createElement.mock.calls[0][1]).not.toHaveProperty('name');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add flight' })).toBeNull());
    expect(api.listElements.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('blocks saving an incomplete leg with an inline message', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Add flight' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add flight' });
    await user.click(within(dialog).getByRole('button', { name: 'Save flight' }));
    expect(await within(dialog).findByText('Enter the flight date')).toBeTruthy();
    expect(api.createElement).not.toHaveBeenCalled();
  });

  it('creates a two-leg flight with legOrder 1 and 2', async () => {
    const user = userEvent.setup();
    api.createElement.mockResolvedValue({ id: 'el-5' });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Add flight' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add flight' });
    await user.click(within(dialog).getByRole('button', { name: 'mock two legs' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save flight' }));

    await waitFor(() =>
      expect(api.createElement).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({
          typeSpecificData: {
            legs: [
              expect.objectContaining({ legOrder: 1, departureAirport: 'DEN', arrivalAirport: 'DAL' }),
              expect.objectContaining({ legOrder: 2, departureAirport: 'DAL', arrivalAirport: 'SJD' }),
            ],
          },
        })
      )
    );
  });

  it('opens a dialog with Details, Bookings and Seats tabs', async () => {
    const user = userEvent.setup();
    api.listElements.mockResolvedValue([twoLegFlight()]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Open DEN → DAL → SJD' }));
    const dialog = await screen.findByRole('dialog', { name: 'DEN → DAL → SJD' });
    expect(within(dialog).getByRole('tab', { name: 'Details' })).toBeTruthy();
    expect(within(dialog).getByText(/Layover: 2h 15m/)).toBeTruthy();

    await user.click(within(dialog).getByRole('tab', { name: /Bookings/ }));
    expect(await within(dialog).findByText('booking card el-7')).toBeTruthy();

    await user.click(within(dialog).getByRole('tab', { name: 'Seats' }));
    expect(await within(dialog).findByText('seat grid leg-1')).toBeTruthy();
    expect(within(dialog).getByText('seat grid leg-2')).toBeTruthy();
  });

  it('edits a leg inline through syncLegs only and keeps the dialog open', async () => {
    const user = userEvent.setup();
    api.listElements.mockResolvedValue([twoLegFlight()]);
    api.syncLegs.mockResolvedValue([]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Open DEN → DAL → SJD' }));
    const dialog = await screen.findByRole('dialog', { name: 'DEN → DAL → SJD' });
    await user.click(within(dialog).getByRole('button', { name: 'Edit leg 2' }));
    const code = within(dialog).getByLabelText('Flight #');
    await user.clear(code);
    await user.type(code, 'WN201');
    await user.click(within(dialog).getByRole('button', { name: 'Save leg' }));

    await waitFor(() =>
      expect(api.syncLegs).toHaveBeenCalledWith('trip-1', 'el-7', [
        expect.objectContaining({ id: 'leg-1', airline: 'WN', flightNumber: '100' }),
        expect.objectContaining({ id: 'leg-2', airline: 'WN', flightNumber: '201', departureAirport: 'DAL', arrivalAirport: 'SJD' }),
      ])
    );
    expect(api.updateElement).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: 'DEN → DAL → SJD' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save leg' })).toBeNull());
  });

  it('edits notes inline and clears them when emptied', async () => {
    const user = userEvent.setup();
    api.listElements.mockResolvedValue([flightEl({ notes: 'Window seats' })]);
    api.updateElement.mockResolvedValue({});
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Open Delta 45' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delta 45' });
    await user.click(within(dialog).getByRole('button', { name: 'Edit notes' }));
    const notes = within(dialog).getByLabelText('Notes');
    await user.clear(notes);
    await user.click(within(dialog).getByRole('button', { name: 'Save notes' }));

    await waitFor(() => expect(api.updateElement).toHaveBeenCalledWith('trip-1', 'el-1', { notes: null }));
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Save notes' })).toBeNull());
  });

  it('deletes a flight after confirming and closes the dialog', async () => {
    const user = userEvent.setup();
    api.listElements.mockResolvedValue([flightEl()]);
    api.deleteElement.mockResolvedValue(undefined);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Open Delta 45' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delta 45' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete flight' }));
    api.listElements.mockResolvedValue([]);
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.deleteElement).toHaveBeenCalledWith('trip-1', 'el-1'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delta 45' })).toBeNull());
  });

  it('shows an inline error with Retry when loading fails', async () => {
    const user = userEvent.setup();
    api.getTrip.mockRejectedValueOnce(new Error('boom'));
    renderPage();

    expect(await screen.findByText('boom')).toBeTruthy();
    const retry = screen.getByRole('button', { name: 'Retry' });
    const callsBefore = api.getTrip.mock.calls.length;
    await user.click(retry);

    await waitFor(() => expect(api.getTrip.mock.calls.length).toBe(callsBefore + 1));
    expect(await screen.findByRole('heading', { name: 'Cabo' })).toBeTruthy();
  });
});
