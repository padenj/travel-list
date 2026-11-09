import { useEffect, useState } from 'react';
import { Button, Chip, Group, Loader, Modal, Radio, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getFamilyPackingLists, getItemGroups } from '../api';
import { tripApi, ApiConflictError } from '../api/tripApi';
import { useOnline } from '../utils/useOnline';
import { describeMemberConflict, destinationErrorText } from '../utils/destinationErrors';
import MemberConflictAlert from './MemberConflictAlert';
import type { DestinationWritePayload, Trip, TripDestination } from '../types/trip';

export interface AddDestinationDialogProps {
  opened: boolean;
  onClose: () => void;
  trip: Trip;
  destinations: TripDestination[];
  familyMembers: any[];
  editing: TripDestination | null;
  onSaved: () => void;
  onChanged?: () => void;
  zIndex?: number;
}

interface MoveConflict {
  memberId: string;
  destinationId: string;
  destinationName: string;
  onlyMember: boolean;
}

const FALLBACK_ERROR = "Couldn't save the destination. Please try again.";
const chipStyles = { root: { maxWidth: '100%' }, label: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' } };

export default function AddDestinationDialog({ opened, onClose, trip, destinations, familyMembers, editing, onSaved, onChanged, zIndex }: AddDestinationDialogProps) {
  const isMobile = useMediaQuery('(max-width: 48em)', undefined, { getInitialValueInEffect: false });
  const online = useOnline();
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [itemGroupIds, setItemGroupIds] = useState<string[]>([]);
  const [existingListId, setExistingListId] = useState<string | null>(null);
  const [itemGroups, setItemGroups] = useState<{ id: string; name: string }[]>([]);
  const [freeLists, setFreeLists] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<MoveConflict | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [sharedItemsTo, setSharedItemsTo] = useState<'existing' | 'new'>('existing');

  useEffect(() => {
    if (!opened) return;
    setName(editing?.name ?? '');
    setMemberIds(editing?.memberIds ?? []);
    setItemGroupIds([]);
    setExistingListId(null);
    setConflict(null);
    setConflictLoading(false);
    setSharedItemsTo('existing');
    if (editing) return;
    let cancelled = false;
    (async () => {
      try {
        const [groupsRes, listsRes] = await Promise.all([getItemGroups(trip.familyId), getFamilyPackingLists(trip.familyId)]);
        if (cancelled) return;
        setItemGroups(groupsRes.response.ok ? groupsRes.data.itemGroups || [] : []);
        // A list can join this trip if it has no trip or is the only destination of another trip.
        const adoptable = (l: any) =>
          !l.trip_destination || (l.trip_destination.destinationCount === 1 && l.trip_destination.tripId !== trip.id);
        setFreeLists(listsRes.response.ok ? (listsRes.data.lists || []).filter(adoptable) : []);
      } catch {
        // optional extras; the dialog still works without them
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, editing, trip.familyId, trip.id]);

  const ownerOf = (memberId: string) => destinations.find(d => d.id !== editing?.id && d.memberIds.includes(memberId));
  const memberName = (m: any) => m.name || m.username;

  const toggleMember = (member: any) => {
    if (memberIds.includes(member.id)) {
      setMemberIds(ids => ids.filter(id => id !== member.id));
      return;
    }
    const owner = ownerOf(member.id);
    if (owner && !window.confirm(`Move ${memberName(member)} from ${owner.name}?`)) return;
    setMemberIds(ids => [...ids, member.id]);
  };

  const save = async (forceMove = false) => {
    setSaving(true);
    setConflict(null);
    try {
      const current = await tripApi.listDestinations(trip.id);
      const others = current.filter(d => d.id !== editing?.id);
      // Fail before sending anything if a move would leave another destination empty.
      const emptied = others.find(d => d.memberIds.length > 0 && d.memberIds.every(id => memberIds.includes(id)));
      if (emptied) {
        showNotification({ title: 'Cannot move everyone', message: `${emptied.name} needs at least one traveler`, color: 'red' });
        return;
      }
      // The server moves these people, and their items, in the same transaction.
      const moveFrom = forceMove || others.some(d => d.memberIds.some(id => memberIds.includes(id)));
      const move = moveFrom ? { moveFrom: true } : {};
      if (editing) {
        const unchanged = memberIds.length === editing.memberIds.length && memberIds.every(id => editing.memberIds.includes(id));
        await tripApi.updateDestination(trip.id, editing.id, unchanged ? { name: name.trim() } : { name: name.trim(), memberIds, ...move });
      } else {
        const payload: DestinationWritePayload = {
          name: name.trim(),
          memberIds,
          itemGroupIds,
          packingListId: existingListId || undefined,
          ...move,
        };
        if (current.length === 1) payload.sharedItemsTo = sharedItemsTo;
        await tripApi.createDestination(trip.id, payload);
      }
      onSaved();
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiConflictError && err.body?.error === 'member_in_other_destination') {
        // Someone else moved this person since the dialog loaded.
        const { memberId, destinationId } = err.body;
        setConflictLoading(true);
        const info = await describeMemberConflict(trip.id, memberId, destinationId);
        setConflictLoading(false);
        setConflict({ memberId, destinationId, ...info });
      } else {
        showNotification({ title: 'Could not save destination', message: destinationErrorText(err, FALLBACK_ERROR), color: 'red' });
      }
    } finally {
      setSaving(false);
    }
  };

  const moveAndRetry = () => {
    if (!conflict) return;
    void save(true);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? `Edit ${editing.name}` : 'Add destination'} fullScreen={!!isMobile} zIndex={zIndex}>
      <Stack>
        <TextInput label="Destination name" placeholder="e.g. Grandma's" value={name} onChange={e => setName(e.currentTarget.value)} />
        <Text size="sm" fw={500}>Who's going?</Text>
        <Group gap="xs">
          {familyMembers.map(member => {
            const owner = ownerOf(member.id);
            const selected = memberIds.includes(member.id);
            return (
              <Chip
                key={member.id}
                checked={selected}
                onChange={() => toggleMember(member)}
                styles={chipStyles}
                style={owner && !selected ? { opacity: 0.6 } : undefined}
              >
                {owner && !selected ? `${memberName(member)} (at ${owner.name})` : memberName(member)}
              </Chip>
            );
          })}
        </Group>
        {!editing && itemGroups.length > 0 && (
          <>
            <Text size="sm" fw={500}>Start with item groups (optional)</Text>
            <Chip.Group multiple value={itemGroupIds} onChange={setItemGroupIds}>
              <Group gap="xs">
                {itemGroups.map(g => <Chip key={g.id} value={g.id} styles={chipStyles}>{g.name}</Chip>)}
              </Group>
            </Chip.Group>
          </>
        )}
        {!editing && freeLists.length > 0 && (
          <Select
            label="Use an existing list (optional)"
            placeholder="Start a new list"
            clearable
            data={freeLists.map(l => ({ value: l.id, label: l.name }))}
            value={existingListId}
            onChange={setExistingListId}
            comboboxProps={{ zIndex: zIndex ? zIndex + 10 : undefined }}
          />
        )}
        {!editing && destinations.length === 1 && (
          <Radio.Group
            label="Shared items (for the whole family)"
            value={sharedItemsTo}
            onChange={value => setSharedItemsTo(value === 'new' ? 'new' : 'existing')}
          >
            <Stack gap="xs" mt="xs">
              <Radio value="existing" label={`Keep shared items in ${destinations[0].name}`} />
              <Radio value="new" label={`Move to ${name.trim() || 'the new destination'}`} />
            </Stack>
          </Radio.Group>
        )}
        {conflictLoading && <Loader size="sm" aria-label="Checking destinations" />}
        {conflict && (
          <MemberConflictAlert
            who={memberName(familyMembers.find(m => m.id === conflict.memberId) ?? {}) || 'Someone'}
            destinationName={conflict.destinationName}
            onlyMember={conflict.onlyMember}
            moving={saving}
            offline={!online}
            onMove={moveAndRetry}
            onDismiss={() => setConflict(null)}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { void save(); }} loading={saving} disabled={!online || !name.trim() || memberIds.length === 0 || !!conflict}>
            {online ? 'Save' : 'Needs a connection'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
