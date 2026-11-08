import { useEffect, useRef, useState } from 'react';
import { Anchor, Button, Group, Input, SegmentedControl, SimpleGrid, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { tripApi } from '../api/tripApi';
import { ArrivalDayOffset, FlightLegDraft, applyLookup, autoArrivalOffset, parseFlightCode } from '../utils/flightLegs';

interface FlightLegFormProps {
  tripId: string;
  draft: FlightLegDraft;
  onChange: (draft: FlightLegDraft) => void;
  idPrefix: string;
}

type LookupStatus = { kind: 'ok' | 'empty' | 'error'; text: string; url?: string };

const OFFSET_OPTIONS = [
  { label: 'Same day', value: '0' },
  { label: '+1', value: '1' },
  { label: '+2', value: '2' },
];

export function FlightLegForm({ tripId, draft, onChange, idPrefix }: FlightLegFormProps) {
  const [status, setStatus] = useState<LookupStatus | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const id = (field: string) => `${idPrefix}-${field}`;

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const set = (patch: Partial<FlightLegDraft>) => onChange({ ...draft, ...patch });

  const setTime = (field: 'departureTime' | 'arrivalTime', value: string) => {
    const next = { ...draft, [field]: value };
    onChange({ ...next, arrivalDayOffset: autoArrivalOffset(next.departureTime, next.arrivalTime, draft.arrivalDayOffset) });
  };

  // Clears a stale "Filled from FlightStats…" message once the flight code or date changes.
  const setFlightCode = (value: string) => {
    set({ flightCode: value });
    setStatus(null);
  };

  const setDate = (value: string) => {
    set({ date: value });
    setStatus(null);
  };

  const lookup = async () => {
    const { airline, flightNumber } = parseFlightCode(draft.flightCode);
    if (!airline || !flightNumber || !draft.date) {
      setStatus({ kind: 'error', text: 'Enter the flight # (e.g. WN1234) and date to look up.' });
      return;
    }
    const startedFlightCode = draft.flightCode;
    const startedDate = draft.date;
    try {
      setLookingUp(true);
      const details = await tripApi.lookupFlightAutofill(tripId, { airlineCode: airline, flightNumber, flightDate: draft.date });
      if (!mountedRef.current) return;
      const stale = draftRef.current.flightCode !== startedFlightCode || draftRef.current.date !== startedDate;
      if (stale) {
        setStatus(null);
        return;
      }
      const found = details.departureAirport || details.arrivalAirport || details.departureDatetime || details.arrivalDatetime;
      if (!found) {
        setStatus({ kind: 'empty', text: 'No schedule found yet. Enter the airports and times manually.', url: details.sourceUrl });
        return;
      }
      onChange(applyLookup(draftRef.current, details));
      setStatus({ kind: 'ok', text: `Filled from FlightStats${details.statusText ? ` (${details.statusText})` : ''}. Check the times before saving.` });
    } catch (err) {
      if (!mountedRef.current) return;
      const stale = draftRef.current.flightCode !== startedFlightCode || draftRef.current.date !== startedDate;
      if (stale) {
        setStatus(null);
        return;
      }
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Flight lookup failed' });
    } finally {
      if (mountedRef.current) setLookingUp(false);
    }
  };

  return (
    <div>
      <SimpleGrid cols={2} spacing="xs" verticalSpacing="xs">
        <TextInput
          id={id('code')}
          label="Flight #"
          placeholder="WN1234"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={draft.flightCode}
          onChange={e => setFlightCode(e.currentTarget.value.toUpperCase())}
        />
        <TextInput id={id('date')} label="Date" type="date" value={draft.date} onChange={e => setDate(e.currentTarget.value)} />
      </SimpleGrid>

      <Group gap="xs" mt={6} wrap="nowrap" align="center">
        <Button size="compact-sm" variant="light" leftSection={<IconSearch size={14} />} onClick={lookup} loading={lookingUp}>
          Look up
        </Button>
        {status && (
          <Text role="status" size="xs" c={status.kind === 'ok' ? 'dimmed' : 'yellow.7'}>
            {status.text}
            {status.url && (
              <>
                {' '}
                <Anchor href={status.url} target="_blank" rel="noreferrer" size="xs">Open FlightStats</Anchor>
              </>
            )}
          </Text>
        )}
      </Group>

      <SimpleGrid cols={2} spacing="xs" verticalSpacing="xs" mt="xs">
        <TextInput
          id={id('from')}
          label="From"
          placeholder="DEN"
          maxLength={4}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={draft.departureAirport}
          onChange={e => set({ departureAirport: e.currentTarget.value.toUpperCase() })}
        />
        <TextInput id={id('departs')} label="Departs" type="time" value={draft.departureTime} onChange={e => setTime('departureTime', e.currentTarget.value)} />
        <TextInput
          id={id('to')}
          label="To"
          placeholder="MCO"
          maxLength={4}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={draft.arrivalAirport}
          onChange={e => set({ arrivalAirport: e.currentTarget.value.toUpperCase() })}
        />
        <TextInput id={id('arrives')} label="Arrives" type="time" value={draft.arrivalTime} onChange={e => setTime('arrivalTime', e.currentTarget.value)} />
      </SimpleGrid>

      <Input.Wrapper label="Arrival day" labelElement="div" labelProps={{ id: id('arrival-day-label') }} mt="xs">
        <SegmentedControl
          fullWidth
          size="xs"
          data={OFFSET_OPTIONS}
          value={String(draft.arrivalDayOffset)}
          onChange={value => set({ arrivalDayOffset: Number(value) as ArrivalDayOffset })}
          aria-labelledby={id('arrival-day-label')}
        />
      </Input.Wrapper>

      <TextInput
        id={id('price-url')}
        mt="xs"
        label="Price check link"
        type="url"
        placeholder="Airline search page (optional)"
        value={draft.checkPriceUrl}
        onChange={e => set({ checkPriceUrl: e.currentTarget.value })}
      />
    </div>
  );
}
