import { useEffect, useState } from 'react';
import { Alert, Button, Card, Container, Group, Loader, Modal, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Title, Badge } from '@mantine/core';
import { Trip } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { formatTripDateRange } from '../utils/tripDates';
import '../styles/trips.css';

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrips = async () => {
    try {
      setLoading(true);
      setError(null);
      setTrips(await tripApi.listTrips());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, []);

  const createTrip = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Trip name is required');
      return;
    }
    if (!!startDate !== !!endDate) {
      setError('Add both dates or leave both empty.');
      return;
    }
    try {
      setCreating(true);
      setError(null);
      await tripApi.createTrip(startDate && endDate ? { name: trimmed, startDate, endDate } : { name: trimmed });
      setName('');
      setStartDate('');
      setEndDate('');
      setShowCreate(false);
      await loadTrips();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip');
    } finally {
      setCreating(false);
    }
  };

  const tripCard = (trip: Trip) => (
    <Card key={trip.id} component="a" href={`/trips/${trip.id}`} withBorder padding="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text fw={600}>{trip.name}</Text>
        {trip.tripType && <Badge variant="light">{trip.tripType}</Badge>}
      </Group>
      {formatTripDateRange(trip.startDate, trip.endDate) && (
        <Text size="sm" c="dimmed">{formatTripDateRange(trip.startDate, trip.endDate)}</Text>
      )}
      {trip.description && <Text size="sm">{trip.description}</Text>}
    </Card>
  );

  const datedTrips = trips.filter(trip => !!trip.startDate);
  const datelessTrips = trips.filter(trip => !trip.startDate);

  const renderTrips = (group: Trip[]) =>
    viewMode === 'card' ? (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>{group.map(tripCard)}</SimpleGrid>
    ) : (
      <Stack gap="xs">{group.map(tripCard)}</Stack>
    );

  return (
    <Container size="lg" py="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>Trips</Title>
        <Group>
          <SegmentedControl
            value={viewMode}
            onChange={value => setViewMode(value as 'list' | 'card')}
            data={[
              { value: 'list', label: 'List' },
              { value: 'card', label: 'Cards' },
            ]}
          />
          <Button onClick={() => setShowCreate(true)}>Create Trip</Button>
        </Group>
      </Group>

      {error && <Alert color="red" mb="md" withCloseButton onClose={() => setError(null)}>{error}</Alert>}

      <Modal opened={showCreate} onClose={() => setShowCreate(false)} title="Create trip">
        <Stack>
          <TextInput placeholder="Trip name" aria-label="Trip name" value={name} onChange={e => setName(e.currentTarget.value)} />
          <TextInput type="date" label="Start date (optional)" value={startDate} onChange={e => setStartDate(e.currentTarget.value)} />
          <TextInput type="date" label="End date (optional)" value={endDate} onChange={e => setEndDate(e.currentTarget.value)} />
          <Button onClick={createTrip} loading={creating}>Save Trip</Button>
        </Stack>
      </Modal>

      {loading ? (
        <Loader size="sm" aria-label="Loading trips" />
      ) : trips.length === 0 ? (
        <Text c="dimmed">No trips yet. Create your first trip!</Text>
      ) : (
        <Stack gap="lg">
          {datedTrips.length > 0 && renderTrips(datedTrips)}
          {datelessTrips.length > 0 && (
            <div>
              <Title order={4} mb="xs">No dates</Title>
              {renderTrips(datelessTrips)}
            </div>
          )}
        </Stack>
      )}
    </Container>
  );
}
