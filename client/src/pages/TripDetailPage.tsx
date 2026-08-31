import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Trip, TripElement } from '../types/trip';
import { tripApi } from '../api/tripApi';
import '../styles/trips.css';

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [elements, setElements] = useState<TripElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;

    const loadTripData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [tripData, elementsData] = await Promise.all([
          tripApi.getTrip(tripId),
          tripApi.listElements(tripId),
        ]);
        setTrip(tripData);
        setElements(elementsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trip');
      } finally {
        setLoading(false);
      }
    };

    loadTripData();
  }, [tripId]);

  if (loading) {
    return <div className="trip-detail-page"><p>Loading...</p></div>;
  }

  if (error) {
    return <div className="trip-detail-page"><p className="error">Error: {error}</p></div>;
  }

  if (!trip) {
    return <div className="trip-detail-page"><p>Trip not found</p></div>;
  }

  // Group elements by type
  const groupedByType = elements.reduce((acc, el) => {
    if (!acc[el.elementType]) acc[el.elementType] = [];
    acc[el.elementType].push(el);
    return acc;
  }, {} as Record<string, TripElement[]>);

  const typeLabels: Record<string, string> = {
    flight: 'Flights',
    hotel: 'Hotels',
    car_rental: 'Car Rentals',
    activity: 'Activities',
  };

  return (
    <div className="trip-detail-page">
      <div className="trip-header">
        <h1>{trip.name}</h1>
        {trip.description && <p className="trip-description">{trip.description}</p>}
        <div className="trip-metadata">
          {trip.tripType && <span className="trip-type">{trip.tripType}</span>}
          <span className="trip-dates">
            {trip.startDate} to {trip.endDate}
          </span>
        </div>
      </div>

      <div className="elements-section">
        {Object.entries(groupedByType).length === 0 ? (
          <p className="no-elements">No elements added yet</p>
        ) : (
          Object.entries(groupedByType).map(([type, items]) => (
            <div key={type} className="element-group">
              <h2>{typeLabels[type] || type}</h2>
              <div className="element-list">
                {items.map(item => (
                  <div key={item.id} className="element-card">
                    <div className="element-header">
                      <h3>{item.name}</h3>
                      {item.bookingReference && (
                        <span className="booking-ref">{item.bookingReference}</span>
                      )}
                    </div>
                    {item.notes && <p className="element-notes">{item.notes}</p>}
                    <div className="element-pricing">
                      {item.priceCash && (
                        <span className="price">${item.priceCash.toFixed(2)}</span>
                      )}
                      {item.pricePoints && (
                        <span className="points">{item.pricePoints} points</span>
                      )}
                    </div>
                    <a href={`/trips/${tripId}/elements/${item.id}`} className="edit-link">
                      View/Edit →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
