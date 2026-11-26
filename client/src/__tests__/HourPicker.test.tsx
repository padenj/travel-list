/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { HourPicker } from '../components/HourPicker';
import { CHECK_IN_QUICK } from '../utils/lodging';

describe('HourPicker', () => {
  afterEach(() => cleanup());

  it('renders quick chips and picks one', () => {
    const onChange = vi.fn();
    renderWithMantine(<HourPicker label="Check-in time" value={null} onChange={onChange} quick={CHECK_IN_QUICK} />);
    expect(screen.getByRole('group', { name: 'Check-in time' })).toBeTruthy();
    for (const name of ['2 PM', '3 PM', '4 PM', '5 PM']) expect(screen.getByRole('checkbox', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: '3 PM' }));
    expect(onChange).toHaveBeenCalledWith('15:00');
  });

  it('clears when the selected chip is clicked', () => {
    const onChange = vi.fn();
    renderWithMantine(<HourPicker label="Check-in time" value="15:00" onChange={onChange} quick={CHECK_IN_QUICK} />);
    expect((screen.getByRole('checkbox', { name: '3 PM' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: '3 PM' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a non-quick value in the Other select and picks from it', () => {
    const onChange = vi.fn();
    renderWithMantine(<HourPicker label="Check-in time" value="13:00" onChange={onChange} quick={CHECK_IN_QUICK} />);
    const other = screen.getByRole('textbox', { name: 'Check-in time other' }) as HTMLInputElement;
    expect(other.value).toBe('1 PM');
    fireEvent.click(other);
    fireEvent.click(screen.getByRole('option', { name: '6 PM' }));
    expect(onChange).toHaveBeenCalledWith('18:00');
  });

  it('shows a legacy value with minutes', () => {
    renderWithMantine(<HourPicker label="Check-in time" value="15:30" onChange={() => {}} quick={CHECK_IN_QUICK} />);
    expect((screen.getByRole('textbox', { name: 'Check-in time other' }) as HTMLInputElement).value).toBe('3:30 PM');
  });
});
