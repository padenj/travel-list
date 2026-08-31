import { Trip, TripElement, TripElementConfirmation, TripAttachment } from '../types/trip';

const API_BASE = '/api/trips';

function handleResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  return response.json();
}

export const tripApi = {
  // Trip CRUD
  listTrips: async (): Promise<Trip[]> => {
    const response = await fetch(`${API_BASE}`);
    return handleResponse(response);
  },

  getTrip: async (tripId: string): Promise<Trip> => {
    const response = await fetch(`${API_BASE}/${tripId}`);
    return handleResponse(response);
  },

  createTrip: async (trip: Partial<Trip>): Promise<Trip> => {
    const response = await fetch(`${API_BASE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trip),
    });
    return handleResponse(response);
  },

  updateTrip: async (tripId: string, updates: Partial<Trip>): Promise<Trip> => {
    const response = await fetch(`${API_BASE}/${tripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteTrip: async (tripId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`Failed to delete trip: ${response.status}`);
    }
  },

  // Element CRUD
  listElements: async (tripId: string): Promise<TripElement[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements`);
    return handleResponse(response);
  },

  getElement: async (tripId: string, elementId: string): Promise<TripElement> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}`);
    return handleResponse(response);
  },

  createElement: async (tripId: string, element: Partial<TripElement>): Promise<TripElement> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(element),
    });
    return handleResponse(response);
  },

  updateElement: async (tripId: string, elementId: string, updates: Partial<TripElement>): Promise<TripElement> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteElement: async (tripId: string, elementId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`Failed to delete element: ${response.status}`);
    }
  },

  // Confirmations
  listConfirmations: async (tripId: string, elementId: string): Promise<TripElementConfirmation[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}/confirmations`);
    return handleResponse(response);
  },

  addConfirmation: async (tripId: string, elementId: string, confirmation: Partial<TripElementConfirmation>): Promise<TripElementConfirmation> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}/confirmations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(confirmation),
    });
    return handleResponse(response);
  },

  updateConfirmation: async (tripId: string, elementId: string, confirmationId: string, updates: Partial<TripElementConfirmation>): Promise<TripElementConfirmation> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}/confirmations/${confirmationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteConfirmation: async (tripId: string, elementId: string, confirmationId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}/confirmations/${confirmationId}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`Failed to delete confirmation: ${response.status}`);
    }
  },
};
