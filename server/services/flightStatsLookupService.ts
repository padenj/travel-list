export interface FlightAutofillLookupInput {
  airlineCode: string;
  flightNumber: string;
  flightDate: string; // YYYY-MM-DD
}

export interface FlightAutofillDetails {
  airlineCode: string;
  flightNumber: string;
  flightDate: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureDatetime?: string;
  arrivalDatetime?: string;
  statusText?: string;
  sourceUrl: string;
}

function buildFlightStatsUrl(input: FlightAutofillLookupInput): string {
  const date = new Date(`${input.flightDate}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `https://www.flightstats.com/v2/flight-tracker/${encodeURIComponent(input.airlineCode)}/${encodeURIComponent(input.flightNumber)}?year=${year}&month=${month}&date=${day}`;
}

function extractNextDataJson(html: string): Record<string, unknown> {
  const marker = '__NEXT_DATA__ = ';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error('FlightStats payload marker not found');
  }

  const start = html.indexOf('{', markerIndex);
  if (start < 0) {
    throw new Error('FlightStats payload start not found');
  }

  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end < 0) {
    throw new Error('FlightStats payload end not found');
  }

  return JSON.parse(html.slice(start, end));
}

function toLocalMinute(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value.slice(0, 16) : undefined;
}

export function parseFlightStatsAutofillFromHtml(
  html: string,
  context: FlightAutofillLookupInput & { sourceUrl: string }
): FlightAutofillDetails {
  const nextData = extractNextDataJson(html) as any;
  const flight = nextData?.props?.initialState?.flightTracker?.flight;
  if (!flight) {
    throw new Error('FlightStats flight data missing');
  }

  const departureAirport = flight?.departureAirport?.iata || flight?.departureAirport?.fs;
  const arrivalAirport = flight?.arrivalAirport?.iata || flight?.arrivalAirport?.fs;
  const schedule = flight?.schedule;
  const departureDatetime =
    toLocalMinute(schedule?.scheduledDeparture) ||
    schedule?.scheduledDepartureUTC ||
    schedule?.estimatedActualDepartureUTC;
  const arrivalDatetime =
    toLocalMinute(schedule?.scheduledArrival) ||
    schedule?.scheduledArrivalUTC ||
    schedule?.estimatedActualArrivalUTC;
  const statusText =
    flight?.status?.statusDescription || flight?.status?.status || flight?.flightNote?.message;

  return {
    airlineCode: context.airlineCode.toUpperCase(),
    flightNumber: context.flightNumber,
    flightDate: context.flightDate,
    departureAirport,
    arrivalAirport,
    departureDatetime,
    arrivalDatetime,
    statusText,
    sourceUrl: context.sourceUrl,
  };
}

export async function lookupFlightStatsAutofill(
  input: FlightAutofillLookupInput,
  fetchImpl: typeof fetch = fetch
): Promise<FlightAutofillDetails> {
  const cleanInput: FlightAutofillLookupInput = {
    airlineCode: input.airlineCode.trim().toUpperCase(),
    flightNumber: input.flightNumber.trim(),
    flightDate: input.flightDate.trim(),
  };
  const url = buildFlightStatsUrl(cleanInput);
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': 'travel-list-flightstats-poc/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`FlightStats request failed with status ${response.status}`);
  }

  const html = await response.text();
  return parseFlightStatsAutofillFromHtml(html, { ...cleanInput, sourceUrl: url });
}
