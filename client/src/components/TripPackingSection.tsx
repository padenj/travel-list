import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Button, Card, Group, Loader, Menu, Modal, Progress, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { showNotification } from '@mantine/notifications';
import { getFamily, getPackingList } from '../api';
import { tripApi, ApiConflictError } from '../api/tripApi';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { buildDestinationGroup, groupProgress } from '../utils/dashboardGroups';
import { destinationErrorText } from '../utils/destinationErrors';
import { useOnline } from '../utils/useOnline';
import type { Trip, TripDestination } from '../types/trip';
import AddDestinationDialog from './AddDestinationDialog';

interface CardData {
  destination: TripDestination;
  memberNames: string[];
  total: number;
  percent: number;
}

const OFFLINE_LABEL = 'Needs a connection';
const itemsLabel = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
// Long destination names must wrap instead of overflowing the button on phones.
const wrapButtonStyles = { root: { height: 'auto', minHeight: 36, paddingBlock: 6 }, label: { whiteSpace: 'normal' as const, textAlign: 'center' as const } };

export default function TripPackingSection({ trip, onChanged }: { trip: Trip; onChanged?: () => void }) {
  const navigate = useNavigate();
  const online = useOnline();
  const { setActiveListId } = useActivePackingList();
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [destinations, setDestinations] = useState<TripDestination[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [dialog, setDialog] = useState<{ editing: TripDestination | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ destination: TripDestination; itemCount: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, familyRes] = await Promise.all([tripApi.listDestinations(trip.id), getFamily(trip.familyId)]);
      const members: any[] = familyRes.response.ok ? familyRes.data.family?.members || [] : [];
      setFamilyMembers(members);
      setDestinations(list);
      setCards(await Promise.all(list.map(async destination => {
        const res = await getPackingList(destination.packingListId);
        const group = buildDestinationGroup({
          listId: destination.packingListId,
          listData: res.response.ok ? res.data : {},
          masterItems: [],
          familyMembers: members,
          currentUserId: null,
          destination,
        });
        const { total, percent } = groupProgress(group);
        return { destination, memberNames: group.members.map(m => m.name), total, percent };
      })));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      showNotification({ title: 'Error', message: 'Could not load packing destinations', color: 'red' });
    } finally {
      setLoaded(true);
    }
  }, [trip.id, trip.familyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openOnDashboard = (destination: TripDestination) => {
    setActiveListId(destination.packingListId);
    navigate('/');
  };

  const deleteDestination = async (destination: TripDestination, options: { moveSharedItemsTo?: string; deleteList?: boolean } = {}) => {
    setDeleting(true);
    try {
      await tripApi.deleteDestination(trip.id, destination.id, options);
      setPendingDelete(null);
      await load();
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiConflictError && err.body?.error === 'destination_has_items') {
        setPendingDelete({ destination, itemCount: Number(err.body.itemCount) || 0 });
        return;
      }
      showNotification({ title: 'Error', message: destinationErrorText(err, 'Failed to delete destination'), color: 'red' });
    } finally {
      setDeleting(false);
    }
  };

  const pending = pendingDelete?.destination ?? null;

  return (
    <section aria-label="Packing" style={{ marginTop: 16 }}>
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Title order={4}>Packing</Title>
        {loaded && !loadFailed && (
          <Button size="xs" variant="light" disabled={!online} onClick={() => setDialog({ editing: null })}>
            {!online ? OFFLINE_LABEL : destinations.length === 0 ? 'Set up packing' : '+ Add destination'}
          </Button>
        )}
      </Group>
      {!loaded && <Loader size="sm" aria-label="Loading packing destinations" />}
      {loadFailed && (
        <Group gap="xs">
          <Text size="sm" c="red">Couldn't load packing destinations.</Text>
          <Button size="compact-sm" variant="default" onClick={() => void load()}>Retry</Button>
        </Group>
      )}
      <Stack gap="xs">
        {cards.map(({ destination, memberNames, total, percent }) => (
          <Card key={destination.id} withBorder padding="sm" style={{ borderLeft: `6px solid var(--mantine-color-${destination.color || 'blue'}-6)` }}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <UnstyledButton
                aria-label={`Open ${destination.name} packing list`}
                onClick={() => openOnDashboard(destination)}
                style={{ flex: 1, minWidth: 0, textAlign: 'left', minHeight: 44 }}
              >
                <Text fw={600} truncate>{destination.name}</Text>
                <Text size="sm" c="dimmed" truncate>{memberNames.join(', ') || 'No travelers'}</Text>
                <Text size="xs" c="dimmed">{`${itemsLabel(total)} · ${percent}% packed`}</Text>
                <Progress value={percent} size="sm" mt={4} color={destination.color || 'blue'} />
              </UnstyledButton>
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" size="lg" aria-label={`Actions for ${destination.name}`}>
                    <IconDots size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {!online && <Menu.Label>{OFFLINE_LABEL}</Menu.Label>}
                  <Menu.Item disabled={!online} onClick={() => setDialog({ editing: destination })}>Rename</Menu.Item>
                  <Menu.Item disabled={!online} onClick={() => setDialog({ editing: destination })}>Change members</Menu.Item>
                  <Menu.Item
                    color="red"
                    disabled={!online}
                    onClick={() => {
                      if (window.confirm(`Delete ${destination.name}?`)) void deleteDestination(destination);
                    }}
                  >
                    Delete
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Card>
        ))}
      </Stack>

      <AddDestinationDialog
        opened={!!dialog}
        onClose={() => setDialog(null)}
        trip={trip}
        destinations={destinations}
        familyMembers={familyMembers}
        editing={dialog?.editing ?? null}
        onSaved={() => setDialog(null)}
        onChanged={() => {
          void load();
          onChanged?.();
        }}
      />

      <Modal
        opened={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={pendingDelete ? `${pendingDelete.destination.name} still has ${itemsLabel(pendingDelete.itemCount)}` : ''}
      >
        <Stack>
          {destinations.filter(d => d.id !== pending?.id).map(other => (
            <Button
              key={other.id}
              variant="light"
              styles={wrapButtonStyles}
              loading={deleting}
              disabled={!online}
              onClick={() => pending && deleteDestination(pending, { moveSharedItemsTo: other.id })}
            >
              {online ? `Move shared items to ${other.name} and delete` : OFFLINE_LABEL}
            </Button>
          ))}
          <Button
            color="red"
            variant="light"
            styles={wrapButtonStyles}
            loading={deleting}
            disabled={!online}
            onClick={() => pending && deleteDestination(pending, { deleteList: true })}
          >
            {online ? 'Delete list too' : OFFLINE_LABEL}
          </Button>
          <Button variant="default" onClick={() => setPendingDelete(null)}>Cancel</Button>
        </Stack>
      </Modal>
    </section>
  );
}
