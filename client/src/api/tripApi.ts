import {
  Trip, TripElement, TripElementConfirmation, TripAttachment, FlightAutofillLookupInput, FlightAutofillDetails,
  TripParticipant, Booking, CreateBookingPayload, BookingTransaction, AddBookingTransactionPayload, FlightTravelerSeat,
} from '../types/trip';
import { getAuthToken } from '../api';

const API_BASE = '/api/trips';

type TripElementWritePayload = Partial<TripElement> & {
  typeSpecificData?: Record<string, unknown>;
};

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function handleResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  return response.json();
}

export const tripApi = {
  // Trip CRUD
  listTrips: async (): Promise<Trip[]> => {
    const response = await fetch(`${API_BASE}`, { headers: authHeaders() });
    return handleResponse(response);
  },

  getTrip: async (tripId: string): Promise<Trip> => {
    const response = await fetch(`${API_BASE}/${tripId}`, { headers: authHeaders() });
    return handleResponse(response);
  },

  createTrip: async (trip: Partial<Trip>): Promise<Trip> => {
    const response = await fetch(`${API_BASE}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(trip),
    });
    return handleResponse(response);
  },

  updateTrip: async (tripId: string, updates: Partial<Trip>): Promise<Trip> => {
    const response = await fetch(`${API_BASE}/${tripId}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteTrip: async (tripId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      throw new Error(`Failed to delete trip: ${response.status}`);
    }
  },

  // Element CRUD
  listElements: async (tripId: string): Promise<TripElement[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements`, { headers: authHeaders() });
    return handleResponse(response);
  },

  getElement: async (tripId: string, elementId: string): Promise<TripElement> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}`, { headers: authHeaders() });
    return handleResponse(response);
  },

  createElement: async (tripId: string, element: TripElementWritePayload): Promise<TripElement> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(element),
    });
    return handleResponse(response);
  },

  updateElement: async (tripId: string, elementId: string, updates: TripElementWritePayload): Promise<TripElement> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteElement: async (tripId: string, elementId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      throw new Error(`Failed to delete element: ${response.status}`);
    }
  },

  lookupFlightAutofill: async (tripId: string, payload: FlightAutofillLookupInput): Promise<FlightAutofillDetails> => {
    const response = await fetch(`${API_BASE}/${tripId}/flight-autofill`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  // Confirmations
  listConfirmations: async (tripId: string, elementId: string): Promise<TripElementConfirmation[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}/confirmations`, { headers: authHeaders() });
    return handleResponse(response);
  },

  addConfirmation: async (tripId: string, elementId: string, confirmation: Partial<TripElementConfirmation>): Promise<TripElementConfirmation> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}/confirmations`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(confirmation),
    });
    return handleResponse(response);
  },

  updateConfirmation: async (tripId: string, elementId: string, confirmationId: string, updates: Partial<TripElementConfirmation>): Promise<TripElementConfirmation> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}/confirmations/${confirmationId}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteConfirmation: async (tripId: string, elementId: string, confirmationId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}/confirmations/${confirmationId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      throw new Error(`Failed to delete confirmation: ${response.status}`);
    }
  },

  // Participants
  listParticipants: async (tripId: string): Promise<TripParticipant[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/participants`, { headers: authHeaders() });
    return handleResponse(response);
  },

  createParticipant: async (tripId: string, participant: { displayName: string; userId?: string }): Promise<TripParticipant> => {
    const response = await fetch(`${API_BASE}/${tripId}/participants`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(participant),
    });
    return handleResponse(response);
  },

  updateParticipant: async (tripId: string, participantId: string, updates: Partial<TripParticipant>): Promise<TripParticipant> => {
    const response = await fetch(`${API_BASE}/${tripId}/participants/${participantId}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteParticipant: async (tripId: string, participantId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/participants/${participantId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Failed to delete participant: ${response.status}`);
    }
  },

  // Bookings
  listBookings: async (tripId: string, elementId?: string): Promise<Booking[]> => {
    const url = elementId
      ? `${API_BASE}/${tripId}/bookings?elementId=${encodeURIComponent(elementId)}`
      : `${API_BASE}/${tripId}/bookings`;
    const response = await fetch(url, { headers: authHeaders() });
    return handleResponse(response);
  },

  getBooking: async (tripId: string, bookingId: string): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}`, { headers: authHeaders() });
    return handleResponse(response);
  },

  createBooking: async (tripId: string, booking: CreateBookingPayload): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(booking),
    });
    return handleResponse(response);
  },

  updateBooking: async (tripId: string, bookingId: string, updates: Partial<CreateBookingPayload>): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteBooking: async (tripId: string, bookingId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      throw new Error(`Failed to delete booking: ${response.status}`);
    }
  },

  linkBookingElement: async (tripId: string, bookingId: string, elementId: string): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/elements`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ elementId }),
    });
    return handleResponse(response);
  },

  unlinkBookingElement: async (tripId: string, bookingId: string, elementId: string): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/elements/${elementId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(response);
  },

  addBookingTraveler: async (tripId: string, bookingId: string, participantId: string): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/travelers`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ participantId }),
    });
    return handleResponse(response);
  },

  removeBookingTraveler: async (tripId: string, bookingId: string, participantId: string): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/travelers/${participantId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(response);
  },

  // Booking transactions
  listBookingTransactions: async (tripId: string, bookingId: string): Promise<BookingTransaction[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/transactions`, { headers: authHeaders() });
    return handleResponse(response);
  },

  addBookingTransaction: async (tripId: string, bookingId: string, transaction: AddBookingTransactionPayload): Promise<BookingTransaction> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/transactions`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(transaction),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `API Error: ${response.status}`);
    }
    return response.json();
  },

  updateBookingTransaction: async (tripId: string, bookingId: string, transactionId: string, updates: Partial<AddBookingTransactionPayload>): Promise<BookingTransaction> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteBookingTransaction: async (tripId: string, bookingId: string, transactionId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/transactions/${transactionId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete transaction: ${response.status}`);
    }
  },

  // Flight seats
  listSeatsForLeg: async (tripId: string, legId: string): Promise<FlightTravelerSeat[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/legs/${legId}/seats`, { headers: authHeaders() });
    return handleResponse(response);
  },

  assignSeat: async (tripId: string, legId: string, participantId: string, seatNumber: string): Promise<FlightTravelerSeat> => {
    const response = await fetch(`${API_BASE}/${tripId}/legs/${legId}/seats/${participantId}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ seatNumber }),
    });
    return handleResponse(response);
  },

  removeSeat: async (tripId: string, legId: string, participantId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/legs/${legId}/seats/${participantId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to remove seat: ${response.status}`);
    }
  },
};
