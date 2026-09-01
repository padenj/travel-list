import { useState, useEffect, useCallback } from 'react';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { BookingTransactionList } from './BookingTransactionList';

interface BookingCardProps {
  tripId: string;
  elementId: string;
  elements: TripElement[];
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
}

function parseNumberInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BookingCard({ tripId, elementId, elements, participants, onParticipantsChanged }: BookingCardProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [advertisedPriceCash, setAdvertisedPriceCash] = useState('');
  const [advertisedPricePoints, setAdvertisedPricePoints] = useState('');
  const [loyaltyProgram, setLoyaltyProgram] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>([]);
  const [newTravelerName, setNewTravelerName] = useState('');
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([elementId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await tripApi.listBookings(tripId, elementId);
    setBookings(data);
  }, [tripId, elementId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleTraveler = (participantId: string) => {
    setSelectedTravelerIds(prev =>
      prev.includes(participantId) ? prev.filter(id => id !== participantId) : [...prev, participantId]
    );
  };

  const toggleElement = (id: string) => {
    setSelectedElementIds(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const saveBooking = async () => {
    try {
      setSaving(true);
      setError(null);
      let travelerIds = [...selectedTravelerIds];

      if (newTravelerName.trim()) {
        const created = await tripApi.createParticipant(tripId, { displayName: newTravelerName.trim() });
        travelerIds.push(created.id);
        onParticipantsChanged([...participants, created]);
      }

      if (travelerIds.length === 0) {
        setError('Select or add at least one traveler');
        return;
      }
      if (selectedElementIds.length === 0) {
        setError('Select at least one element this booking covers');
        return;
      }

      await tripApi.createBooking(tripId, {
        confirmationNumber: confirmationNumber.trim() || undefined,
        advertisedPriceCash: parseNumberInput(advertisedPriceCash),
        advertisedPricePoints: parseNumberInput(advertisedPricePoints),
        loyaltyProgram: loyaltyProgram.trim() || undefined,
        notes: notes.trim() || undefined,
        elementIds: selectedElementIds,
        travelerIds,
      });

      setConfirmationNumber('');
      setAdvertisedPriceCash('');
      setAdvertisedPricePoints('');
      setLoyaltyProgram('');
      setNotes('');
      setSelectedTravelerIds([]);
      setNewTravelerName('');
      setSelectedElementIds([elementId]);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save booking');
    } finally {
      setSaving(false);
    }
  };

  const otherElements = elements.filter(e => e.id !== elementId && e.elementType === 'flight');

  return (
    <div className="booking-card-section">
      <div className="booking-card-header">
        <h4>Bookings</h4>
        <button type="button" onClick={() => setShowForm(prev => !prev)}>
          {showForm ? 'Cancel' : '+ Add Booking'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {showForm && (
        <div className="booking-form">
          <div className="create-element-field">
            <label htmlFor={`booking-conf-${elementId}`}>Confirmation number</label>
            <input id={`booking-conf-${elementId}`} type="text" value={confirmationNumber} onChange={(e) => setConfirmationNumber(e.target.value)} />
          </div>
          <div className="create-element-field">
            <label htmlFor={`booking-price-cash-${elementId}`}>Advertised price per person (cash)</label>
            <input id={`booking-price-cash-${elementId}`} type="number" step="0.01" value={advertisedPriceCash} onChange={(e) => setAdvertisedPriceCash(e.target.value)} />
          </div>
          <div className="create-element-field">
            <label htmlFor={`booking-price-points-${elementId}`}>Advertised price per person (points)</label>
            <input id={`booking-price-points-${elementId}`} type="number" step="1" value={advertisedPricePoints} onChange={(e) => setAdvertisedPricePoints(e.target.value)} />
          </div>
          <div className="create-element-field">
            <label htmlFor={`booking-loyalty-${elementId}`}>Loyalty program</label>
            <input id={`booking-loyalty-${elementId}`} type="text" value={loyaltyProgram} onChange={(e) => setLoyaltyProgram(e.target.value)} />
          </div>
          <div className="create-element-field">
            <label htmlFor={`booking-notes-${elementId}`}>Notes</label>
            <input id={`booking-notes-${elementId}`} type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <fieldset>
            <legend>Travelers on this booking</legend>
            {participants.map(p => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={selectedTravelerIds.includes(p.id)}
                  onChange={() => toggleTraveler(p.id)}
                />
                {p.displayName}
              </label>
            ))}
            <div className="create-element-field">
              <label htmlFor={`booking-new-traveler-${elementId}`}>+ New traveler</label>
              <input
                id={`booking-new-traveler-${elementId}`}
                type="text"
                value={newTravelerName}
                onChange={(e) => setNewTravelerName(e.target.value)}
                placeholder="Name of traveler not yet on the trip"
              />
            </div>
          </fieldset>

          {otherElements.length > 0 && (
            <fieldset>
              <legend>Also applies to</legend>
              {otherElements.map(el => (
                <label key={el.id}>
                  <input
                    type="checkbox"
                    checked={selectedElementIds.includes(el.id)}
                    onChange={() => toggleElement(el.id)}
                  />
                  {el.name}
                </label>
              ))}
            </fieldset>
          )}

          <button type="button" onClick={saveBooking} disabled={saving}>
            {saving ? 'Saving...' : 'Save Booking'}
          </button>
        </div>
      )}

      {bookings.length === 0 && !showForm && <p className="no-elements">No bookings yet for this element</p>}

      {bookings.map(booking => {
        const travelerNames = booking.travelerIds
          .map(id => participants.find(p => p.id === id)?.displayName || id)
          .join(', ');
        const otherLinkedElements = booking.elementIds
          .filter(id => id !== elementId)
          .map(id => elements.find(e => e.id === id))
          .filter((e): e is TripElement => !!e);
        const actualPerPerson = booking.travelerIds.length > 0
          ? booking.actualTotalCash / booking.travelerIds.length
          : booking.actualTotalCash;

        return (
          <div key={booking.id} className="element-card">
            <div className="element-header">
              <h3>{booking.currentConfirmationNumber || 'No confirmation number'}</h3>
            </div>
            <p>Travelers: {travelerNames}</p>
            {booking.advertisedPriceCash !== null && (
              <p>Advertised: ${booking.advertisedPriceCash.toFixed(2)} / person</p>
            )}
            <p>Actual total: ${booking.actualTotalCash.toFixed(2)} (${actualPerPerson.toFixed(2)} / person)</p>
            {otherLinkedElements.length > 0 && (
              <p>
                Also covers:{' '}
                {otherLinkedElements.map((e, index) => (
                  <span key={e.id}>
                    {index > 0 ? ', ' : ''}
                    {e.name}
                  </span>
                ))}
              </p>
            )}
            <BookingTransactionList tripId={tripId} bookingId={booking.id} onChanged={load} />
          </div>
        );
      })}
    </div>
  );
}
