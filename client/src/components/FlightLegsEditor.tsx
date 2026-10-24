import { useState } from 'react';
import { tripApi } from '../api/tripApi';
import {
  FlightLegDraft,
  emptyLegDraft,
  formatLayover,
  layoverMinutes,
  toDatetimeLocalValue,
} from '../utils/flightLegs';

interface FlightLegsEditorProps {
  tripId: string;
  legs: FlightLegDraft[];
  onChange: (legs: FlightLegDraft[]) => void;
  idPrefix?: string;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Moves the departure/arrival dates to the new flight date, keeping times and the arrival day offset.
function changeFlightDate(leg: FlightLegDraft, newDate: string): Partial<FlightLegDraft> {
  const patch: Partial<FlightLegDraft> = { flightDate: newDate };
  const depDate = leg.departureDatetime.slice(0, 10);
  if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return patch;
  if (leg.departureDatetime) {
    patch.departureDatetime = `${newDate}${leg.departureDatetime.slice(10)}`;
  }
  if (leg.arrivalDatetime) {
    const arrDate = leg.arrivalDatetime.slice(0, 10);
    const offset = /^\d{4}-\d{2}-\d{2}$/.test(depDate) && /^\d{4}-\d{2}-\d{2}$/.test(arrDate)
      ? Math.round((Date.parse(arrDate) - Date.parse(depDate)) / 86400000)
      : 0;
    patch.arrivalDatetime = `${shiftDate(newDate, offset)}${leg.arrivalDatetime.slice(10)}`;
  }
  return patch;
}

type LookupStatus = { kind: 'ok' | 'empty' | 'error'; text: string; url?: string };

export function FlightLegsEditor({ tripId, legs, onChange, idPrefix = 'leg' }: FlightLegsEditorProps) {
  const [status, setStatus] = useState<Record<number, LookupStatus>>({});
  const [lookingUp, setLookingUp] = useState<number | null>(null);

  const setLegStatus = (index: number, value: LookupStatus) =>
    setStatus(prev => ({ ...prev, [index]: value }));

  const update = (index: number, patch: Partial<FlightLegDraft>) =>
    onChange(legs.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));

  const addLeg = () => onChange([...legs, emptyLegDraft(legs[legs.length - 1]?.flightDate ?? '')]);

  const removeLeg = (index: number) => {
    onChange(legs.filter((_, i) => i !== index));
    setStatus({});
  };

  const lookup = async (index: number) => {
    const leg = legs[index];
    const date = leg.flightDate || leg.departureDatetime.slice(0, 10);
    if (!leg.airline.trim() || !leg.flightNumber.trim() || !date) {
      setLegStatus(index, { kind: 'error', text: 'Enter the airline code, flight number and flight date to look up.' });
      return;
    }
    try {
      setLookingUp(index);
      const details = await tripApi.lookupFlightAutofill(tripId, {
        airlineCode: leg.airline.trim().toUpperCase(),
        flightNumber: leg.flightNumber.trim(),
        flightDate: date,
      });
      const found = details.departureAirport || details.arrivalAirport || details.departureDatetime || details.arrivalDatetime;
      if (!found) {
        setLegStatus(index, {
          kind: 'empty',
          text: 'No schedule found for this flight yet. Enter the airports and times manually.',
          url: details.sourceUrl,
        });
        return;
      }
      update(index, {
        flightDate: details.flightDate || date,
        airline: details.airlineCode || leg.airline,
        flightNumber: details.flightNumber || leg.flightNumber,
        departureAirport: details.departureAirport || leg.departureAirport,
        arrivalAirport: details.arrivalAirport || leg.arrivalAirport,
        departureDatetime: toDatetimeLocalValue(details.departureDatetime) || leg.departureDatetime,
        arrivalDatetime: toDatetimeLocalValue(details.arrivalDatetime) || leg.arrivalDatetime,
      });
      setLegStatus(index, {
        kind: 'ok',
        text: `Filled from FlightStats${details.statusText ? ` (${details.statusText})` : ''}. Check the times before saving.`,
      });
    } catch (err) {
      setLegStatus(index, { kind: 'error', text: err instanceof Error ? err.message : 'Flight lookup failed' });
    } finally {
      setLookingUp(null);
    }
  };

  return (
    <div className="flight-legs-editor">
      {legs.map((leg, index) => {
        const id = (field: string) => `${idPrefix}-${index}-${field}`;
        const layover = index > 0 ? layoverMinutes(legs[index - 1].arrivalDatetime, leg.departureDatetime) : null;
        const legStatus = status[index];
        return (
          <div key={leg.id ?? `new-${index}`}>
            {index > 0 && layover !== null && (
              <p className="flight-layover">
                Layover{leg.departureAirport ? ` in ${leg.departureAirport.toUpperCase()}` : ''}: {formatLayover(layover)}
              </p>
            )}
            <div className="flight-leg-row">
              <h5>Flight {index + 1}</h5>
              <div className="create-element-field">
                <label htmlFor={id('date')}>Flight date</label>
                <input id={id('date')} type="date" value={leg.flightDate} onChange={(e) => update(index, changeFlightDate(leg, e.target.value))} />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('airline')}>Airline code</label>
                <input id={id('airline')} type="text" value={leg.airline} onChange={(e) => update(index, { airline: e.target.value.toUpperCase() })} placeholder="e.g. WN" />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('number')}>Flight number</label>
                <input id={id('number')} type="text" value={leg.flightNumber} onChange={(e) => update(index, { flightNumber: e.target.value })} placeholder="e.g. 722" />
              </div>
              <div className="create-element-field">
                <button type="button" className="view-toggle-btn" onClick={() => lookup(index)} disabled={lookingUp === index}>
                  {lookingUp === index ? 'Looking up...' : 'Look up flight details'}
                </button>
              </div>
              {legStatus && (
                <p role="status" className={`flight-lookup-status ${legStatus.kind}`}>
                  {legStatus.text}
                  {legStatus.url && (
                    <>
                      {' '}
                      <a href={legStatus.url} target="_blank" rel="noreferrer">Open FlightStats</a>
                    </>
                  )}
                </p>
              )}
              <div className="create-element-field">
                <label htmlFor={id('from')}>From (airport code)</label>
                <input id={id('from')} type="text" maxLength={4} value={leg.departureAirport} onChange={(e) => update(index, { departureAirport: e.target.value.toUpperCase() })} placeholder="e.g. DEN" />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('departs')}>Departs</label>
                <input id={id('departs')} type="datetime-local" value={leg.departureDatetime} onChange={(e) => update(index, { departureDatetime: e.target.value })} />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('to')}>To (airport code)</label>
                <input id={id('to')} type="text" maxLength={4} value={leg.arrivalAirport} onChange={(e) => update(index, { arrivalAirport: e.target.value.toUpperCase() })} placeholder="e.g. SJD" />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('arrives')}>Arrives</label>
                <input id={id('arrives')} type="datetime-local" value={leg.arrivalDatetime} onChange={(e) => update(index, { arrivalDatetime: e.target.value })} />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('price-url')}>Price check link</label>
                <input id={id('price-url')} type="url" value={leg.checkPriceUrl} onChange={(e) => update(index, { checkPriceUrl: e.target.value })} placeholder="Airline search page (optional)" />
              </div>
              {legs.length > 1 && (
                <button type="button" className="view-toggle-btn" onClick={() => removeLeg(index)}>
                  Remove flight {index + 1}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <button type="button" className="view-toggle-btn" onClick={addLeg}>
        Add connecting flight
      </button>
    </div>
  );
}
