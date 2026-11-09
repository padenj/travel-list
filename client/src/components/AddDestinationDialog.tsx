import { useEffect, useState } from 'react';
import { Button, Chip, Group, Loader, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getFamilyPackingLists, getItemGroups } from '../api';
import { tripApi, ApiConflictError } from '../api/tripApi';
import { useOnline } from '../utils/useOnline';
import { describeMemberConflict, destinationErrorText } from '../utils/destinationErrors';
import MemberConflictAlert from './MemberConflictAlert';
import type { Trip, TripDestination } from '../types/trip';

export interface AddDestinationDialogProps {
  opened: boolean;
  onClose: () => void;
  trip: Trip;
  destinations: TripDestination[];
  familyMembers: any[];
  editing: TripDestination | null;
  onSaved: () => void;
}

interface MoveConflict {
  memberId: string;
  destinationId: string;
  destinationName: string;
  onlyMember: boolean;
}

const FALLBACK_ERROR = "Couldn't save the destination. Please try again.";
const chipStyles = { root: { maxWidth: '100%' }, label: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' } };

export default function AddDestinationDialog({ opened, onClose, trip, destinations, familyMembers, editing, onSaved }: AddDestinationDialogProps) {
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

  useEffect(() => {
    if (!opened) return;
    setName(editing?.name ?? '');
    setMemberIds(editing?.memberIds ?? []);
    setItemGroupIds([]);
    setExistingListId(null);
    setConflict(null);
    setConflictLoading(false);
    if (editing) return;
    let cancelled = false;
    (async () => {
      try {
        const [groupsRes, listsRes] = await Promise.all([getItemGroups(trip.familyId), getFamilyPackingLists(trip.familyId)]);
        if (cancelled) return;
        setItemGroups(groupsRes.response.ok ? groupsRes.data.itemGroups || [] : []);
        setFreeLists(listsRes.response.ok ? (listsRes.data.lists || []).filter((l: any) => !l.trip_destination) : []);
      } catch {
        // optional extras; the dialog still works without them
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, editing, trip.familyId]);

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

  const save = async () => {
    // Fail before changing anything if a move would leave another destination empty.
    const emptied = destinations.find(d => d.id !== editing?.id && d.memberIds.length > 0 && d.memberIds.every(id => memberIds.includes(id)));
    if (emptied) {
      showNotification({ title: 'Cannot move everyone', message: `${emptied.name} needs at least one traveler`, color: 'red' });
      return;
    }
    setSaving(true);
    setConflict(null);
    try {
      for (const owner of destinations) {
        if (owner.id === editing?.id || !owner.memberIds.some(id => memberIds.includes(id))) continue;
        await tripApi.updateDestination(trip.id, owner.id, { memberIds: owner.memberIds.filter(id => !memberIds.includes(id)) });
      }
      if (editing) {
        await tripApi.updateDestination(trip.id, editing.id, { name: name.trim(), memberIds });
      } else {
        await tripApi.createDestination(trip.id, { name: name.trim(), memberIds, itemGroupIds, packingListId: existingListId || undefined });
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiConflictError && err.body?.error === 'member_in_other_destination') {
        // Someone else moved this person since the trip page loaded.
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

  const moveAndRetry = async () => {
    if (!conflict) return;
    setSaving(true);
    try {
      const source = (await tripApi.listDestinations(trip.id)).find(d => d.id === conflict.destinationId);
      if (!source) throw new Error('not_found');
      const remaining = source.memberIds.filter(id => id !== conflict.memberId);
      if (remaining.length === 0) {
        setConflict({ ...conflict, destinationName: source.name, onlyMember: true });
        setSaving(false);
        return;
      }
      await tripApi.updateDestination(trip.id, source.id, { memberIds: remaining });
    } catch (err) {
      setConflict(null);
      showNotification({ title: 'Could not move traveler', message: destinationErrorText(err, FALLBACK_ERROR), color: 'red' });
      setSaving(false);
      return;
    }
    setConflict(null);
    await save();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? `Edit ${editing.name}` : 'Add destination'} fullScreen={!!isMobile}>
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
          />
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
          <Button onClick={save} loading={saving} disabled={!online || !name.trim() || memberIds.length === 0 || !!conflict}>
            {online ? 'Save' : 'Needs a connection'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
