/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { AddMenu } from '../components/AddMenu';

describe('AddMenu', () => {
  afterEach(() => cleanup());

  it('opens a menu with Flight and Lodging', async () => {
    const onAddFlight = vi.fn();
    const onAddLodging = vi.fn();
    renderWithMantine(<AddMenu onAddFlight={onAddFlight} onAddLodging={onAddLodging} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Lodging' }));
    expect(onAddLodging).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Flight' }));
    expect(onAddFlight).toHaveBeenCalled();
  });
});
