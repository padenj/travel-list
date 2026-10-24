import { useState, useEffect, useCallback } from 'react';
import { TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';

interface TripParticipantsPanelProps {
  tripId: string;
  refreshKey?: number;
  onParticipantsChanged: (participants: TripParticipant[]) => void;
}

export function TripParticipantsPanel({ tripId, refreshKey = 0, onParticipantsChanged }: TripParticipantsPanelProps) {
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await tripApi.listParticipants(tripId);
    setParticipants(data);
    onParticipantsChanged(data);
  }, [tripId, onParticipantsChanged]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, refreshKey]);

  const addParticipant = async () => {
    if (!newName.trim()) return;
    try {
      setAdding(true);
      setError(null);
      await tripApi.createParticipant(tripId, { displayName: newName.trim() });
      setNewName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add traveler');
    } finally {
      setAdding(false);
    }
  };

  const removeParticipant = async (id: string) => {
    try {
      setError(null);
      await tripApi.deleteParticipant(tripId, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove traveler');
    }
  };

  return (
    <div className="trip-participants-panel">
      <h2>Travelers</h2>
      {error && <p className="error">{error}</p>}
      <ul className="trip-participants-list">
        {participants.map(p => (
          <li key={p.id} className="trip-participant-item">
            <span>{p.displayName}</span>
            <button type="button" className="view-toggle-btn" onClick={() => removeParticipant(p.id)} aria-label={`Remove ${p.displayName}`}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="create-element-field">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Traveler name"
        />
        <button type="button" className="view-toggle-btn" onClick={addParticipant} disabled={adding}>
          {adding ? 'Adding...' : 'Add Traveler'}
        </button>
      </div>
    </div>
  );
}

/**
 * Adds a traveler by display name if they don't already exist among `participants`
 * (case-insensitive match), returning the resulting participant. Used by booking
 * forms to support inline "+ New traveler" creation without duplicating people.
 */
export async function findOrCreateParticipant(
  tripId: string,
  displayName: string,
  participants: TripParticipant[]
): Promise<TripParticipant> {
  const existing = participants.find(p => p.displayName.toLowerCase() === displayName.trim().toLowerCase());
  if (existing) return existing;
  return tripApi.createParticipant(tripId, { displayName: displayName.trim() });
}
