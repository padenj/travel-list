import { ReactNode, useId } from 'react';
import { Autocomplete, Checkbox, Chip, Group, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { PropertyAmenity, Refundability, TripDestination } from '../types/trip';
import { StayDraft, addDays } from '../utils/stayDraft';
import { BOOKING_SITES, CHECK_IN_QUICK, CHECK_OUT_QUICK, PROPERTY_AMENITY_OPTIONS, REFUNDABILITY_OPTIONS } from '../utils/lodging';
import { HourPicker } from './HourPicker';
import { CouponsEditor } from './CouponsEditor';
import { PriceEntry } from './PriceEntry';

interface LodgingStayFormProps {
  draft: StayDraft;
  onChange: (draft: StayDraft) => void;
  destinations: TripDestination[];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <Text size="sm" fw={600} mt="sm" mb={4}>{title}</Text>
      <Stack gap="xs">{children}</Stack>
    </div>
  );
}

export function LodgingStayForm({ draft, onChange, destinations }: LodgingStayFormProps) {
  const uid = useId();
  const set = <K extends keyof StayDraft>(key: K, value: StayDraft[K]) => onChange({ ...draft, [key]: value });

  const setCheckIn = (value: string) => {
    const next = { ...draft, checkInDate: value };
    if (value && !draft.checkOutDate) next.checkOutDate = addDays(value, 1);
    onChange(next);
  };

  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <div>
          <Section title="Hotel">
            <TextInput id={`${uid}-name`} label="Hotel name" value={draft.name} onChange={e => set('name', e.currentTarget.value)} />
            <Textarea id={`${uid}-address`} label="Address" autosize minRows={2} value={draft.address} onChange={e => set('address', e.currentTarget.value)} />
            <TextInput id={`${uid}-phone`} label="Phone" type="tel" value={draft.phone} onChange={e => set('phone', e.currentTarget.value)} />
            <TextInput id={`${uid}-website`} label="Website" type="url" value={draft.website} onChange={e => set('website', e.currentTarget.value)} />
            <TextInput id={`${uid}-in-date`} label="Check-in date" type="date" value={draft.checkInDate} onChange={e => setCheckIn(e.currentTarget.value)} />
            <HourPicker label="Check-in time" value={draft.checkInTime || null} onChange={v => set('checkInTime', v ?? '')} quick={CHECK_IN_QUICK} />
            <TextInput id={`${uid}-out-date`} label="Check-out date" type="date" value={draft.checkOutDate} onChange={e => set('checkOutDate', e.currentTarget.value)} />
            <HourPicker label="Check-out time" value={draft.checkOutTime || null} onChange={v => set('checkOutTime', v ?? '')} quick={CHECK_OUT_QUICK} />
            {destinations.length > 0 && (
              <Select
                id={`${uid}-destination`}
                label="Destination"
                placeholder="None"
                clearable
                data={destinations.map(d => ({ value: d.id, label: d.name }))}
                value={draft.destinationId}
                onChange={value => set('destinationId', value)}
              />
            )}
          </Section>

          <Section title="Booking">
            <Autocomplete id={`${uid}-site`} label="Booking site" data={BOOKING_SITES} value={draft.bookingSite} onChange={value => set('bookingSite', value)} />
            <TextInput id={`${uid}-itin`} label="Site itinerary #" value={draft.siteItineraryNumber} onChange={e => set('siteItineraryNumber', e.currentTarget.value)} />
            <TextInput id={`${uid}-conf`} label="Hotel confirmation #" value={draft.confirmationNumber} onChange={e => set('confirmationNumber', e.currentTarget.value)} />
            <TextInput id={`${uid}-loyalty`} label="Loyalty program" value={draft.loyaltyProgram} onChange={e => set('loyaltyProgram', e.currentTarget.value)} />
          </Section>
        </div>

        <div>
          <Section title="Price">
            <Group grow gap="xs">
              <TextInput id={`${uid}-rate-cash`} label="Advertised nightly (cash)" type="number" step="0.01" value={draft.rateCash} onChange={e => set('rateCash', e.currentTarget.value)} />
              <TextInput id={`${uid}-rate-points`} label="Advertised nightly (points)" type="number" step="1" value={draft.ratePoints} onChange={e => set('ratePoints', e.currentTarget.value)} />
            </Group>
            <Group grow gap="xs">
              <TextInput id={`${uid}-cash`} label="Advertised total (cash)" type="number" step="0.01" value={draft.priceCash} onChange={e => set('priceCash', e.currentTarget.value)} />
              <TextInput id={`${uid}-points`} label="Advertised total (points)" type="number" step="1" value={draft.pricePoints} onChange={e => set('pricePoints', e.currentTarget.value)} />
            </Group>
            <Checkbox id={`${uid}-taxes`} label="Includes taxes & fees" checked={draft.includesTaxes} onChange={e => set('includesTaxes', e.currentTarget.checked)} />
            <Text size="sm" fw={600} mt={4}>Coupons</Text>
            <CouponsEditor coupons={draft.coupons} onChange={coupons => set('coupons', coupons)} />
            <PriceEntry value={draft.price} onChange={price => set('price', price)} />
          </Section>

          <Section title="Cancellation">
            <SegmentedControl
              aria-label="Refundability"
              fullWidth
              size="xs"
              data={[...REFUNDABILITY_OPTIONS, { value: '', label: 'Unset' }]}
              value={draft.refundability ?? ''}
              onChange={value => set('refundability', (value || null) as Refundability | null)}
            />
            <TextInput id={`${uid}-cancel-date`} label="Cancel by date" type="date" value={draft.cancelDate} onChange={e => set('cancelDate', e.currentTarget.value)} />
            <HourPicker label="Cancel by time" value={draft.cancelTime || null} onChange={v => set('cancelTime', v ?? '')} quick={[]} />
            <Textarea id={`${uid}-policy`} label="Policy" autosize minRows={1} value={draft.cancellationPolicy} onChange={e => set('cancellationPolicy', e.currentTarget.value)} />
          </Section>
        </div>
      </SimpleGrid>

      <Section title="Property amenities">
        <Chip.Group multiple value={draft.amenities} onChange={value => set('amenities', value as PropertyAmenity[])}>
          <Group gap={6}>
            {PROPERTY_AMENITY_OPTIONS.map(o => <Chip key={o.value} value={o.value} size="xs">{o.label}</Chip>)}
          </Group>
        </Chip.Group>
        <TextInput id={`${uid}-other`} label="Other amenities" value={draft.otherAmenities} onChange={e => set('otherAmenities', e.currentTarget.value)} />
      </Section>

      <Textarea id={`${uid}-notes`} mt="sm" label="Notes" autosize minRows={1} value={draft.notes} onChange={e => set('notes', e.currentTarget.value)} />
    </>
  );
}
