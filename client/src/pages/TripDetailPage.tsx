import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Trip, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { TripParticipantsPanel } from '../components/TripParticipantsPanel';
import { BookingCard } from '../components/BookingCard';
import { FlightSeatGrid } from '../components/FlightSeatGrid';
import '../styles/trips.css';

type TripElementPayload = Partial<TripElement> & {
  typeSpecificData?: {
    legs?: Array<{
      legOrder: number;
      departureAirport?: string;
      departureDatetime?: string;
      arrivalAirport?: string;
      arrivalDatetime?: string;
      flightNumber?: string;
      airline?: string;
    }>;
  };
};

function parseNumberInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoDateAtMidnight(date: string): string {
  return `${date}T00:00:00Z`;
}

function displayDateOnly(value?: string): string | null {
  if (!value) return null;
  const [datePart] = value.split('T');
  return datePart || null;
}

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [elements, setElements] = useState<TripElement[]>([]);
  const [showAddElementForm, setShowAddElementForm] = useState(false);
  const [creatingElement, setCreatingElement] = useState(false);
  const [newElementType, setNewElementType] = useState<TripElement['elementType']>('flight');
  const [newElementName, setNewElementName] = useState('');
  const [newElementNotes, setNewElementNotes] = useState('');
  const [newBookingReference, setNewBookingReference] = useState('');
  const [newPriceCash, setNewPriceCash] = useState('');
  const [newPricePoints, setNewPricePoints] = useState('');
  const [newFlightDate, setNewFlightDate] = useState('');
  const [newFlightAirlineCode, setNewFlightAirlineCode] = useState('');
  const [newFlightNumber, setNewFlightNumber] = useState('');
  const [newFlightDepartureAirport, setNewFlightDepartureAirport] = useState('');
  const [newFlightArrivalAirport, setNewFlightArrivalAirport] = useState('');
  const [newFlightDepartureDatetime, setNewFlightDepartureDatetime] = useState('');
  const [newFlightArrivalDatetime, setNewFlightArrivalDatetime] = useState('');
  const [flightAutofillStatus, setFlightAutofillStatus] = useState('');
  const [flightAutofillLoading, setFlightAutofillLoading] = useState(false);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [editingBookingReference, setEditingBookingReference] = useState('');
  const [editingPriceCash, setEditingPriceCash] = useState('');
  const [editingPricePoints, setEditingPricePoints] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTripData = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const [tripData, elementsData, participantsData] = await Promise.all([
        tripApi.getTrip(id),
        tripApi.listElements(id),
        tripApi.listParticipants(id),
      ]);
      setTrip(tripData);
      setElements(elementsData);
      setParticipants(participantsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trip');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tripId) return;
    loadTripData(tripId);
  }, [tripId]);

  useEffect(() => {
    if (newElementType !== 'flight' || nameManuallyEdited) return;
    const dep = newFlightDepartureAirport.trim();
    const arr = newFlightArrivalAirport.trim();
    if (dep && arr) {
      setNewElementName(`${dep} → ${arr}`);
    }
  }, [newElementType, newFlightDepartureAirport, newFlightArrivalAirport, nameManuallyEdited]);

  const createElement = async () => {
    if (!tripId) return;
    if (!newElementName.trim()) {
      setError('Element name is required');
      return;
    }
    if (newElementType === 'flight' && !newFlightDate.trim()) {
      setError('Flight date is required for flights');
      return;
    }

    try {
      setCreatingElement(true);
      setError(null);

      const payload: TripElementPayload = {
        elementType: newElementType,
        name: newElementName.trim(),
        notes: newElementNotes.trim() || undefined,
      };

      if (newElementType !== 'flight') {
        payload.bookingReference = newBookingReference.trim() || undefined;
        payload.priceCash = parseNumberInput(newPriceCash);
        payload.pricePoints = parseNumberInput(newPricePoints);
      }

      if (newElementType === 'flight') {
        payload.typeSpecificData = {
          legs: [
            {
              legOrder: 1,
              departureAirport: newFlightDepartureAirport.trim() || 'TBD',
              arrivalAirport: newFlightArrivalAirport.trim() || 'TBD',
              departureDatetime: newFlightDepartureDatetime || isoDateAtMidnight(newFlightDate.trim()),
              arrivalDatetime: newFlightArrivalDatetime || isoDateAtMidnight(newFlightDate.trim()),
              airline: newFlightAirlineCode.trim().toUpperCase() || undefined,
              flightNumber: newFlightNumber.trim() || undefined,
            },
          ],
        };
      }

      await tripApi.createElement(tripId, payload);
      setNewElementName('');
      setNewElementNotes('');
      setNewBookingReference('');
      setNewPriceCash('');
      setNewPricePoints('');
      setNewFlightDate('');
      setNewFlightAirlineCode('');
      setNewFlightNumber('');
      setNewFlightDepartureAirport('');
      setNewFlightArrivalAirport('');
      setNewFlightDepartureDatetime('');
      setNewFlightArrivalDatetime('');
      setFlightAutofillStatus('');
      setNameManuallyEdited(false);
      setNewElementType('flight');
      setShowAddElementForm(false);
      await loadTripData(tripId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add element');
    } finally {
      setCreatingElement(false);
    }
  };

  const autoFillFlightDetails = async () => {
    if (!tripId) return;
    if (!newFlightDate.trim() || !newFlightAirlineCode.trim() || !newFlightNumber.trim()) {
      setError('Flight date, airline code, and flight number are required to auto-fill');
      return;
    }

    try {
      setFlightAutofillLoading(true);
      setError(null);
      const details = await tripApi.lookupFlightAutofill(tripId, {
        airlineCode: newFlightAirlineCode.trim().toUpperCase(),
        flightNumber: newFlightNumber.trim(),
        flightDate: newFlightDate.trim(),
      });

      setNewFlightAirlineCode(details.airlineCode);
      setNewFlightNumber(details.flightNumber);
      setNewFlightDate(details.flightDate);
      setNewFlightDepartureAirport(details.departureAirport || '');
      setNewFlightArrivalAirport(details.arrivalAirport || '');
      setNewFlightDepartureDatetime(details.departureDatetime || '');
      setNewFlightArrivalDatetime(details.arrivalDatetime || '');
      setFlightAutofillStatus(details.statusText || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to auto-fill flight details');
    } finally {
      setFlightAutofillLoading(false);
    }
  };

  const startEditingElement = (element: TripElement) => {
    setEditingElementId(element.id);
    setEditingName(element.name);
    setEditingNotes(element.notes || '');
    setEditingBookingReference(element.bookingReference || '');
    setEditingPriceCash(element.priceCash !== undefined && element.priceCash !== null ? String(element.priceCash) : '');
    setEditingPricePoints(element.pricePoints !== undefined && element.pricePoints !== null ? String(element.pricePoints) : '');
  };

  const cancelEditingElement = () => {
    setEditingElementId(null);
    setEditingName('');
    setEditingNotes('');
    setEditingBookingReference('');
    setEditingPriceCash('');
    setEditingPricePoints('');
  };

  const saveElementEdits = async (elementId: string) => {
    if (!tripId) return;
    if (!editingName.trim()) {
      setError('Element name is required');
      return;
    }

    try {
      setSavingEdit(true);
      setError(null);
      const editingElement = elements.find(e => e.id === elementId);
      const payload: Partial<TripElement> = {
        name: editingName.trim(),
        notes: editingNotes.trim() || undefined,
      };
      if (editingElement?.elementType !== 'flight') {
        payload.bookingReference = editingBookingReference.trim() || undefined;
        payload.priceCash = parseNumberInput(editingPriceCash);
        payload.pricePoints = parseNumberInput(editingPricePoints);
      }
      await tripApi.updateElement(tripId, elementId, payload);
      cancelEditingElement();
      await loadTripData(tripId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save element');
    } finally {
      setSavingEdit(false);
    }
  };

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
          {trip.startDate && trip.endDate && (
            <span className="trip-dates">
              {trip.startDate} to {trip.endDate}
            </span>
          )}
        </div>
        <button
          className="create-trip-btn"
          onClick={() => setShowAddElementForm(prev => !prev)}
          type="button"
        >
          {showAddElementForm ? 'Cancel' : 'Add Element'}
        </button>
      </div>

      {tripId && (
        <TripParticipantsPanel
          tripId={tripId}
          onParticipantsChanged={setParticipants}
        />
      )}

      {showAddElementForm && (
        <div className="create-element-form">
          <div className="create-element-field">
            <label htmlFor="element-type">Type</label>
            <select
              id="element-type"
              value={newElementType}
              onChange={(e) => setNewElementType(e.target.value as TripElement['elementType'])}
            >
              <option value="flight">Flight</option>
              <option value="hotel">Hotel</option>
              <option value="car_rental">Car Rental</option>
              <option value="activity">Activity</option>
            </select>
          </div>
          <div className="create-element-field">
            <label htmlFor="element-name">Name</label>
            <input
              id="element-name"
              type="text"
              value={newElementName}
              onChange={(e) => {
                setNewElementName(e.target.value);
                setNameManuallyEdited(true);
              }}
              placeholder="e.g. Southwest Flight 1234"
            />
          </div>
          <div className="create-element-field">
            <label htmlFor="element-notes">Notes</label>
            <input
              id="element-notes"
              type="text"
              value={newElementNotes}
              onChange={(e) => setNewElementNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
          {newElementType !== 'flight' && (
            <>
              <div className="create-element-field">
                <label htmlFor="element-booking-reference">Booking or itinerary reference</label>
                <input
                  id="element-booking-reference"
                  type="text"
                  value={newBookingReference}
                  onChange={(e) => setNewBookingReference(e.target.value)}
                  placeholder="e.g. Expedia itinerary # 12345"
                />
              </div>
              <div className="create-element-field">
                <label htmlFor="element-price-cash">Price cash</label>
                <input
                  id="element-price-cash"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPriceCash}
                  onChange={(e) => setNewPriceCash(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="create-element-field">
                <label htmlFor="element-price-points">Price points</label>
                <input
                  id="element-price-points"
                  type="number"
                  min="0"
                  step="1"
                  value={newPricePoints}
                  onChange={(e) => setNewPricePoints(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </>
          )}
          {newElementType === 'flight' && (
            <>
              <div className="create-element-field">
                <label htmlFor="flight-date">Flight date</label>
                <input
                  id="flight-date"
                  type="date"
                  value={newFlightDate}
                  onChange={(e) => setNewFlightDate(e.target.value)}
                />
              </div>
              <div className="create-element-field">
                <label htmlFor="flight-airline-code">Airline code</label>
                <input
                  id="flight-airline-code"
                  type="text"
                  value={newFlightAirlineCode}
                  onChange={(e) => setNewFlightAirlineCode(e.target.value.toUpperCase())}
                  placeholder="e.g. WN"
                />
              </div>
              <div className="create-element-field">
                <label htmlFor="flight-number">Flight number</label>
                <input
                  id="flight-number"
                  type="text"
                  value={newFlightNumber}
                  onChange={(e) => setNewFlightNumber(e.target.value)}
                  placeholder="e.g. WN123"
                />
              </div>
              <div className="create-element-field">
                <button
                  className="view-toggle-btn"
                  type="button"
                  onClick={autoFillFlightDetails}
                  disabled={flightAutofillLoading}
                >
                  {flightAutofillLoading ? 'Looking up...' : 'Auto-fill flight details (POC)'}
                </button>
              </div>
              <p className="element-notes">
                Confirmation number, pricing, and travelers are entered per-booking below after saving this element.
              </p>
              {(newFlightDepartureAirport || newFlightArrivalAirport || flightAutofillStatus) && (
                <div className="flight-autofill-preview">
                  <strong>Lookup result:</strong>{' '}
                  {newFlightDepartureAirport || '—'} → {newFlightArrivalAirport || '—'}
                  {newFlightDepartureDatetime && ` • Dep ${newFlightDepartureDatetime}`}
                  {newFlightArrivalDatetime && ` • Arr ${newFlightArrivalDatetime}`}
                  {flightAutofillStatus && ` • ${flightAutofillStatus}`}
                </div>
              )}
            </>
          )}
          <button className="create-trip-submit-btn" type="button" onClick={createElement} disabled={creatingElement}>
            {creatingElement ? 'Saving...' : 'Save Element'}
          </button>
        </div>
      )}

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
                      {item.elementType !== 'flight' && item.bookingReference && (
                        <span className="booking-ref">{item.bookingReference}</span>
                      )}
                    </div>
                    {item.elementType === 'flight' && item.legs?.[0] && (
                      <div className="element-flight-meta">
                        {displayDateOnly(item.legs[0].departureDatetime) && (
                          <span>Date: {displayDateOnly(item.legs[0].departureDatetime)}</span>
                        )}
                        {item.legs[0].flightNumber && <span>Flight: {item.legs[0].flightNumber}</span>}
                      </div>
                    )}
                    {item.notes && <p className="element-notes">{item.notes}</p>}
                    {item.elementType !== 'flight' && (
                      <div className="element-pricing">
                        {item.priceCash !== undefined && item.priceCash !== null && (
                          <span className="price">${item.priceCash.toFixed(2)}</span>
                        )}
                        {item.pricePoints !== undefined && item.pricePoints !== null && (
                          <span className="points">{item.pricePoints} points</span>
                        )}
                      </div>
                    )}
                    {item.elementType === 'flight' && tripId && (
                      <>
                        {item.legs?.map(leg => (
                          <FlightSeatGrid key={leg.id} tripId={tripId} legId={leg.id} travelers={participants} />
                        ))}
                        <BookingCard
                          tripId={tripId}
                          elementId={item.id}
                          elements={elements}
                          participants={participants}
                          onParticipantsChanged={setParticipants}
                        />
                      </>
                    )}
                    <button className="edit-link" type="button" onClick={() => startEditingElement(item)}>
                      View/Edit
                    </button>
                    {editingElementId === item.id && (
                      <div className="edit-element-form">
                        <div className="create-element-field">
                          <label htmlFor={`edit-name-${item.id}`}>Name</label>
                          <input
                            id={`edit-name-${item.id}`}
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                          />
                        </div>
                        {item.elementType !== 'flight' && (
                          <>
                            <div className="create-element-field">
                              <label htmlFor={`edit-booking-reference-${item.id}`}>Booking or itinerary reference</label>
                              <input
                                id={`edit-booking-reference-${item.id}`}
                                type="text"
                                value={editingBookingReference}
                                onChange={(e) => setEditingBookingReference(e.target.value)}
                              />
                            </div>
                            <div className="create-element-field">
                              <label htmlFor={`edit-price-cash-${item.id}`}>Price cash</label>
                              <input
                                id={`edit-price-cash-${item.id}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={editingPriceCash}
                                onChange={(e) => setEditingPriceCash(e.target.value)}
                              />
                            </div>
                            <div className="create-element-field">
                              <label htmlFor={`edit-price-points-${item.id}`}>Price points</label>
                              <input
                                id={`edit-price-points-${item.id}`}
                                type="number"
                                min="0"
                                step="1"
                                value={editingPricePoints}
                                onChange={(e) => setEditingPricePoints(e.target.value)}
                              />
                            </div>
                          </>
                        )}                        <div className="create-element-field edit-notes-field">
                          <label htmlFor={`edit-notes-${item.id}`}>Notes</label>
                          <input
                            id={`edit-notes-${item.id}`}
                            type="text"
                            value={editingNotes}
                            onChange={(e) => setEditingNotes(e.target.value)}
                          />
                        </div>
                        <div className="edit-element-actions">
                          <button
                            className="create-trip-submit-btn"
                            type="button"
                            onClick={() => saveElementEdits(item.id)}
                            disabled={savingEdit}
                          >
                            {savingEdit ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button className="view-toggle-btn" type="button" onClick={cancelEditingElement}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
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
