import { useState, useEffect, useCallback } from 'react';
import { TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';

interface FlightSeatGridProps {
  tripId: string;
  legId: string;
  travelers: TripParticipant[];
}

export function FlightSeatGrid({ tripId, legId, travelers }: FlightSeatGridProps) {
  const [seatByParticipant, setSeatByParticipant] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const seats = await tripApi.listSeatsForLeg(tripId, legId);
    const map: Record<string, string> = {};
    for (const seat of seats) {
      map[seat.participantId] = seat.seatNumber || '';
    }
    setSeatByParticipant(map);
  }, [tripId, legId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (participantId: string, value: string) => {
    setSeatByParticipant(prev => ({ ...prev, [participantId]: value }));
  };

  const handleBlur = async (participantId: string) => {
    const seatNumber = seatByParticipant[participantId];
    if (!seatNumber || !seatNumber.trim()) {
      await tripApi.removeSeat(tripId, legId, participantId);
      return;
    }
    await tripApi.assignSeat(tripId, legId, participantId, seatNumber.trim());
  };

  if (travelers.length === 0) {
    return null;
  }

  return (
    <div className="flight-seat-grid">
      {travelers.map(traveler => (
        <div key={traveler.id} className="create-element-field">
          <label htmlFor={`seat-${legId}-${traveler.id}`}>{traveler.displayName} seat</label>
          <input
            id={`seat-${legId}-${traveler.id}`}
            type="text"
            value={seatByParticipant[traveler.id] || ''}
            onChange={(e) => handleChange(traveler.id, e.target.value)}
            onBlur={() => handleBlur(traveler.id)}
            placeholder="e.g. 14C"
          />
        </div>
      ))}
    </div>
  );
}
