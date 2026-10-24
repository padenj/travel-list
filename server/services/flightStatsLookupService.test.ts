import { describe, it, expect, vi } from 'vitest';
import { lookupFlightStatsAutofill, parseFlightStatsAutofillFromHtml } from './flightStatsLookupService';

const sampleHtml = `
<!doctype html>
<html>
  <body>
    <script>__NEXT_DATA__ = {"props":{"initialState":{"flightTracker":{"flight":{"schedule":{"scheduledDepartureUTC":"2026-08-29T15:10:00.000Z","scheduledArrivalUTC":"2026-08-29T18:05:00.000Z"},"departureAirport":{"iata":"DEN"},"arrivalAirport":{"iata":"SJD"},"status":{"status":"Arrived","statusDescription":"Delayed by 15m"}}}}}}</script>
  </body>
</html>
`;

describe('flightStatsLookupService', () => {
  it('parses normalized autofill details from FlightStats HTML', () => {
    const details = parseFlightStatsAutofillFromHtml(sampleHtml, {
      airlineCode: 'WN',
      flightNumber: '722',
      flightDate: '2026-08-29',
      sourceUrl: 'https://www.flightstats.com/v2/flight-tracker/WN/722?year=2026&month=8&date=29',
    });

    expect(details).toEqual({
      airlineCode: 'WN',
      flightNumber: '722',
      flightDate: '2026-08-29',
      departureAirport: 'DEN',
      arrivalAirport: 'SJD',
      departureDatetime: '2026-08-29T15:10:00.000Z',
      arrivalDatetime: '2026-08-29T18:05:00.000Z',
      statusText: 'Delayed by 15m',
      sourceUrl: 'https://www.flightstats.com/v2/flight-tracker/WN/722?year=2026&month=8&date=29',
    });
  });

  it('fetches and parses html via lookup function', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => sampleHtml,
    });

    const details = await lookupFlightStatsAutofill(
      { airlineCode: 'WN', flightNumber: '722', flightDate: '2026-08-29' },
      fetchMock as any
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.flightstats.com/v2/flight-tracker/WN/722?year=2026&month=8&date=29',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('travel-list') }),
      })
    );
    expect(details.departureAirport).toBe('DEN');
    expect(details.arrivalAirport).toBe('SJD');
  });

  it('prefers scheduled local times over UTC and actual times', () => {
    const html = `<script>__NEXT_DATA__ = {"props":{"initialState":{"flightTracker":{"flight":{"schedule":{"scheduledDeparture":"2026-10-24T09:00:00.000","scheduledDepartureUTC":"2026-10-24T15:00:00.000Z","estimatedActualDeparture":"2026-10-24T08:53:00.000","estimatedActualDepartureUTC":"2026-10-24T14:53:00.000Z","scheduledArrival":"2026-10-24T11:00:00.000","scheduledArrivalUTC":"2026-10-24T18:00:00.000Z"},"departureAirport":{"iata":"DEN"},"arrivalAirport":{"iata":"SJD"},"status":{"status":"S"}}}}}}</script>`;
    const details = parseFlightStatsAutofillFromHtml(html, {
      airlineCode: 'WN', flightNumber: '722', flightDate: '2026-10-24', sourceUrl: 'https://example.com',
    });
    expect(details.departureDatetime).toBe('2026-10-24T09:00');
    expect(details.arrivalDatetime).toBe('2026-10-24T11:00');
  });
});
