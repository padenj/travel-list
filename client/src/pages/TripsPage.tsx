import { useState, useEffect } from 'react';
import { Trip } from '../types/trip';
import { tripApi } from '../api/tripApi';
import '../styles/trips.css';

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

    loadTrips();
  }, []);

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
        <button 
          className="view-toggle-btn"
          onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
        >
          Toggle {viewMode === 'list' ? 'Card' : 'List'} View
        </button>
      </div>

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
