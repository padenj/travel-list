import { useState, useEffect } from 'react';
import { Trip } from '../types/trip';
import { tripApi } from '../api/tripApi';
import '../styles/trips.css';

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [newTripStartDate, setNewTripStartDate] = useState('');
  const [newTripEndDate, setNewTripEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrips = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await tripApi.listTrips();
      setTrips(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, []);

  const createTrip = async () => {
    if (!newTripName || !newTripStartDate || !newTripEndDate) {
      setError('Name, start date, and end date are required');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      await tripApi.createTrip({
        name: newTripName,
        startDate: newTripStartDate,
        endDate: newTripEndDate,
      });
      setNewTripName('');
      setNewTripStartDate('');
      setNewTripEndDate('');
      setShowCreateForm(false);
      await loadTrips();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="trips-page"><p>Loading trips...</p></div>;
  }

  if (error) {
    return <div className="trips-page"><p className="error">Error: {error}</p></div>;
  }

  return (
    <div className="trips-page">
      <div className="trips-header">
        <h1>Trips</h1>
        <div className="trips-header-actions">
          <button
            className="create-trip-btn"
            onClick={() => setShowCreateForm(prev => !prev)}
          >
            {showCreateForm ? 'Cancel' : 'Create Trip'}
          </button>
          <button
            className="view-toggle-btn"
            onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
          >
            Toggle {viewMode === 'list' ? 'Card' : 'List'} View
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="create-trip-form">
          <label htmlFor="trip-name" className="sr-only">Trip name</label>
          <input
            id="trip-name"
            type="text"
            placeholder="Trip name"
            value={newTripName}
            onChange={(e) => setNewTripName(e.target.value)}
          />
          <label htmlFor="trip-start-date" className="sr-only">Start date</label>
          <input
            id="trip-start-date"
            type="date"
            value={newTripStartDate}
            onChange={(e) => setNewTripStartDate(e.target.value)}
          />
          <label htmlFor="trip-end-date" className="sr-only">End date</label>
          <input
            id="trip-end-date"
            type="date"
            value={newTripEndDate}
            onChange={(e) => setNewTripEndDate(e.target.value)}
          />
          <button className="create-trip-submit-btn" onClick={createTrip} disabled={creating}>
            {creating ? 'Creating...' : 'Save Trip'}
          </button>
        </div>
      )}

      {trips.length === 0 ? (
        <p className="no-trips">No trips yet. Create your first trip!</p>
      ) : (
        <div className={`trips-container trips-${viewMode}`}>
          {trips.map(trip => (
            <a 
              key={trip.id} 
              href={`/trips/${trip.id}`} 
              className="trip-item"
            >
              <h2>{trip.name}</h2>
              {trip.description && <p className="trip-description">{trip.description}</p>}
              {trip.tripType && <span className="trip-type">{trip.tripType}</span>}
              <span className="trip-dates">
                {trip.startDate} to {trip.endDate}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
