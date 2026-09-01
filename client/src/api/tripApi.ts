import { Trip, TripElement, TripElementConfirmation, TripAttachment, FlightAutofillLookupInput, FlightAutofillDetails } from '../types/trip';
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
};
