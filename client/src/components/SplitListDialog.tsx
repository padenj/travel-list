import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Group, Loader, Modal, Radio, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { getFamily, getPackingList } from '../api';
import { tripApi, ApiConflictError } from '../api/tripApi';
import { useOnline } from '../utils/useOnline';
import { describeMemberConflict, destinationErrorText } from '../utils/destinationErrors';
import MemberConflictAlert from './MemberConflictAlert';
import type { SplitResult, Trip } from '../types/trip';

export interface SplitListDialogProps {
  opened: boolean;
  onClose: () => void;
  familyId: string | null;
  listId: string | null;
  listName: string;
  onSplit?: (result: SplitResult, tripId: string) => void;
}

interface Person {
  id: string;
  name: string;
}

export function canLeaveWhoGoesWhere(people: Person[], destinationNames: string[], assignment: Record<string, number | undefined>): boolean {
  if (people.length === 0) return false;
  if (destinationNames.some(n => !n.trim())) return false;
  if (people.some(p => assignment[p.id] === undefined)) return false;
  return destinationNames.every((_, index) => people.some(p => assignment[p.id] === index));
}

const DEFAULT_DESTINATIONS = ['Destination 1', 'Destination 2'];
const FALLBACK_ERROR = "Couldn't split the list. Please try again.";

interface MoveConflict {
  memberId: string;
  destinationId: string;
  destinationName: string;
  onlyMember: boolean;
}

export default function SplitListDialog({ opened, onClose, familyId, listId, listName, onSplit }: SplitListDialogProps) {
  const isMobile = useMediaQuery('(max-width: 48em)', undefined, { getInitialValueInEffect: false });
  const [step, setStep] = useState(0);
  const [tripMode, setTripMode] = useState<'new' | 'existing'>('new');
  const [tripName, setTripName] = useState(listName);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [existingTripId, setExistingTripId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [sharedCount, setSharedCount] = useState(0);
  const [destinationNames, setDestinationNames] = useState<string[]>(DEFAULT_DESTINATIONS);
  const [assignment, setAssignment] = useState<Record<string, number | undefined>>({});
  const [sharedIndex, setSharedIndex] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<MoveConflict | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const createdTripId = useRef<string | null>(null);
  const createdDetails = useRef<{ name: string; startDate: string; endDate: string } | null>(null);
  const online = useOnline();

  useEffect(() => {
    if (!opened || !listId || !familyId) return;
    let cancelled = false;
    setStep(0);
    setTripMode('new');
    setTripName(listName);
    setStartDate('');
    setEndDate('');
    setExistingTripId(null);
    setDestinationNames(DEFAULT_DESTINATIONS);
    setAssignment({});
    setSharedIndex('0');
    setPeople([]);
    setSharedCount(0);
    setTrips([]);
    setLoadError(null);
    setSplitError(null);
    setConflict(null);
    createdTripId.current = null;
    createdDetails.current = null;
    setConflictLoading(false);
    (async () => {
      try {
        const [listRes, familyRes, tripList] = await Promise.all([
          getPackingList(listId),
          getFamily(familyId),
          tripApi.listTrips().catch(() => [] as Trip[]),
        ]);
        if (cancelled) return;
        if (!listRes.response.ok || !familyRes.response.ok) {
          setLoadError('Could not load the list. Close this dialog and try again.');
          return;
        }
        const familyMembers: any[] = familyRes.data.family?.members || [];
        const memberIds: string[] = listRes.data.list?.member_ids || [];
        const onList = memberIds.length > 0 ? familyMembers.filter(m => memberIds.includes(m.id)) : familyMembers;
        setPeople(onList.map(m => ({ id: m.id, name: m.name || m.username })));
        setSharedCount((listRes.data.items || []).filter((i: any) => i.whole_family).length);
        setTrips(tripList);
      } catch {
        if (!cancelled) setLoadError('Could not load the list. Close this dialog and try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, listId, familyId, listName]);

  const tripStepValid = tripMode === 'new'
    ? !!tripName.trim() && !!startDate && !!endDate && endDate >= startDate
    : !!existingTripId;
  const canAdvance = tripStepValid && !loadError;
  const whoValid = canLeaveWhoGoesWhere(people, destinationNames, assignment);
  // Splitting changes several lists at once, so it needs the server (spec: Offline).
  const labelFor = (index: number) => destinationNames[index].trim() || `Destination ${index + 1}`;

  const tripId = () => (tripMode === 'new' ? createdTripId.current : existingTripId) as string;

  const submit = async () => {
    if (!listId) return;
    setSubmitting(true);
    setSplitError(null);
    setConflict(null);
    try {
      let id = tripId();
      if (!id) {
        id = (await tripApi.createTrip({ name: tripName.trim(), startDate, endDate })).id;
        createdTripId.current = id;
        createdDetails.current = { name: tripName.trim(), startDate, endDate };
      } else if (tripMode === 'new' && createdDetails.current) {
        const prev = createdDetails.current;
        const next = { name: tripName.trim(), startDate, endDate };
        if (prev.name !== next.name || prev.startDate !== next.startDate || prev.endDate !== next.endDate) {
          await tripApi.updateTrip(id, next);
          createdDetails.current = next;
        }
      }
      const result = await tripApi.splitList(id, {
        sourceListId: listId,
        destinations: destinationNames.map((name, index) => ({
          name: name.trim(),
          memberIds: people.filter(p => assignment[p.id] === index).map(p => p.id),
        })),
        sharedItemsDestinationIndex: Number(sharedIndex),
      });
      showNotification({
        title: 'List split',
        message: result.skippedCount > 0
          ? `${result.skippedCount} item(s) didn't belong to anyone here and stayed in ${labelFor(0)}`
          : `Created ${destinationNames.length} destinations`,
        color: 'green',
      });
      onSplit?.(result, id);
      onClose();
    } catch (err) {
      if (err instanceof ApiConflictError && err.body?.error === 'member_in_other_destination') {
        const { memberId, destinationId } = err.body;
        setConflictLoading(true);
        const { destinationName, onlyMember } = await describeMemberConflict(tripId(), memberId, destinationId);
        setConflictLoading(false);
        setConflict({ memberId, destinationId, destinationName, onlyMember });
      } else {
        setSplitError(destinationErrorText(err, FALLBACK_ERROR));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const moveAndRetry = async () => {
    if (!conflict) return;
    setSubmitting(true);
    try {
      const destinations = await tripApi.listDestinations(tripId());
      const source = destinations.find(d => d.id === conflict.destinationId);
      if (!source) throw new Error('missing destination');
      const remaining = source.memberIds.filter(id => id !== conflict.memberId);
      if (remaining.length === 0) {
        setConflict({ ...conflict, destinationName: source.name, onlyMember: true });
        setSubmitting(false);
        return;
      }
      await tripApi.updateDestination(tripId(), source.id, { memberIds: remaining });
    } catch {
      setConflict(null);
      setSplitError(FALLBACK_ERROR);
      setSubmitting(false);
      return;
    }
    setConflict(null);
    await submit();
  };

  const removeDestination = (removed: number) => {
    setDestinationNames(names => names.filter((_, i) => i !== removed));
    setAssignment(a => {
      const next: Record<string, number | undefined> = {};
      for (const [id, idx] of Object.entries(a)) {
        if (idx === undefined || idx === removed) continue;
        next[id] = idx > removed ? idx - 1 : idx;
      }
      return next;
    });
    setSharedIndex(v => {
      const n = Number(v);
      return String(Math.min(n > removed ? n - 1 : n, destinationNames.length - 2));
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Split "${listName}" by destination`} fullScreen={!!isMobile} size="lg">
      {step === 0 && (
        <Stack>
          <Text fw={600}>Which trip is this for?</Text>
          <SegmentedControl
            fullWidth
            value={tripMode}
            onChange={v => setTripMode(v as 'new' | 'existing')}
            data={[
              { label: 'New trip', value: 'new' },
              { label: 'Existing trip', value: 'existing', disabled: trips.length === 0 },
            ]}
          />
          {tripMode === 'new' ? (
            <>
              <TextInput label="Trip name" value={tripName} onChange={e => setTripName(e.currentTarget.value)} />
              <Group grow>
                <TextInput type="date" label="Start date" value={startDate} onChange={e => setStartDate(e.currentTarget.value)} />
                <TextInput type="date" label="End date" value={endDate} onChange={e => setEndDate(e.currentTarget.value)} />
              </Group>
            </>
          ) : (
            <Select
              label="Trip"
              placeholder="Choose a trip"
              data={trips.map(t => ({ value: t.id, label: t.name }))}
              value={existingTripId}
              onChange={setExistingTripId}
            />
          )}
          {loadError && <Text c="red" size="sm">{loadError}</Text>}
          <Group justify="flex-end">
            <Button onClick={() => setStep(1)} disabled={!canAdvance}>Next</Button>
          </Group>
        </Stack>
      )}

      {step === 1 && (
        <Stack>
          <Text fw={600}>Who goes where?</Text>
          {destinationNames.map((name, index) => (
            <Group key={index} gap="xs" wrap="nowrap">
              <TextInput
                style={{ flex: 1 }}
                aria-label={`Destination ${index + 1} name`}
                value={name}
                onChange={e => {
                  const value = e.currentTarget.value;
                  setDestinationNames(names => names.map((n, i) => (i === index ? value : n)));
                }}
              />
              {index >= 2 && (
                <ActionIcon variant="subtle" color="red" aria-label={`Remove ${labelFor(index)}`} onClick={() => removeDestination(index)}>
                  <IconX size={16} />
                </ActionIcon>
              )}
            </Group>
          ))}
          <Button
            variant="subtle"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setDestinationNames(names => [...names, `Destination ${names.length + 1}`])}
          >
            + Add destination
          </Button>
          {people.map(person => (
            <Stack key={person.id} gap={4}>
              <Text size="sm" fw={500}>{person.name}</Text>
              <Group gap={4} role="group" aria-label={`Destination for ${person.name}`}>
                {destinationNames.map((_, index) => (
                  <Button
                    key={index}
                    size="compact-md"
                    maw="100%"
                    styles={{ label: { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                    variant={assignment[person.id] === index ? 'filled' : 'default'}
                    aria-pressed={assignment[person.id] === index}
                    onClick={() => setAssignment(a => ({ ...a, [person.id]: index }))}
                  >
                    {labelFor(index)}
                  </Button>
                ))}
              </Group>
            </Stack>
          ))}
          <Group justify="space-between">
            <Button variant="default" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={() => setStep(2)} disabled={!whoValid}>Next</Button>
          </Group>
        </Stack>
      )}

      {step === 2 && (
        <Stack>
          <Radio.Group label={`Where should the ${sharedCount} shared items go?`} value={sharedIndex} onChange={setSharedIndex}>
            <Stack gap="xs" mt="xs">
              {destinationNames.map((_, index) => (
                <Radio key={index} value={String(index)} label={labelFor(index)} />
              ))}
            </Stack>
          </Radio.Group>
          <Text size="sm" c="dimmed">Personal items follow each person, and anything already packed stays checked.</Text>
          {conflictLoading && <Loader size="sm" aria-label="Checking destinations" />}
          {conflict && (
            <MemberConflictAlert
              who={people.find(p => p.id === conflict.memberId)?.name ?? 'Someone'}
              destinationName={conflict.destinationName}
              onlyMember={conflict.onlyMember}
              moving={submitting}
              onMove={moveAndRetry}
              onDismiss={() => setConflict(null)}
            />
          )}
          {splitError && <Text c="red" size="sm">{splitError}</Text>}
          <Group justify="space-between">
            <Button variant="default" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={submit} loading={submitting} disabled={!online}>{online ? 'Split list' : 'Needs a connection'}</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
