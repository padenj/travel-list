/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { AddLodgingDialog } from '../components/AddLodgingDialog';
import { tripApi } from '../api/tripApi';

vi.mock('../api/tripApi', () => ({ tripApi: { createElement: vi.fn() } }));

describe('AddLodgingDialog', () => {
  beforeEach(() => vi.mocked(tripApi.createElement).mockReset());
  afterEach(() => cleanup());

  it('requires a name', async () => {
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={() => {}} onCreated={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save stay' }));
    expect(await screen.findByText('Hotel name is required')).toBeTruthy();
    expect(tripApi.createElement).not.toHaveBeenCalled();
  });

  it('defaults check-out to check-in + 1 and creates the stay', async () => {
    const created = { id: 'h1', elementType: 'hotel', name: 'Casa' };
    vi.mocked(tripApi.createElement).mockResolvedValue(created as any);
    const onCreated = vi.fn();
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={() => {}} onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText('Hotel name'), 'Casa');
    fireEvent.change(screen.getByLabelText('Check-in date'), { target: { value: '2027-03-01' } });
    expect((screen.getByLabelText('Check-out date') as HTMLInputElement).value).toBe('2027-03-02');
    expect(screen.queryByRole('textbox', { name: 'Destination' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save stay' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(tripApi.createElement).toHaveBeenCalledWith('t1', expect.objectContaining({
      elementType: 'hotel', name: 'Casa',
      typeSpecificData: expect.objectContaining({ checkInDate: '2027-03-01', checkOutDate: '2027-03-02', destinationId: null }),
    }));
  });

  it('shows the destination select when the trip has destinations', () => {
    renderWithMantine(<AddLodgingDialog tripId="t1" opened
      destinations={[{ id: 'd1', tripId: 't1', name: 'Paris', color: null, position: 0, packingListId: 'p', memberIds: [] }]}
      onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Destination' })).toBeTruthy();
  });

  it('shows server errors inline', async () => {
    vi.mocked(tripApi.createElement).mockRejectedValueOnce(new Error('Destination not found'));
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={() => {}} onCreated={() => {}} />);
    await userEvent.type(screen.getByLabelText('Hotel name'), 'Casa');
    fireEvent.change(screen.getByLabelText('Check-in date'), { target: { value: '2027-03-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save stay' }));
    expect(await screen.findByText('Destination not found')).toBeTruthy();
  });
});
