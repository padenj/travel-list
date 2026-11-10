/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import ShowPackedToggle, { useShowPacked } from '../components/ShowPackedToggle';

function Harness() {
  const [value, setValue] = useShowPacked();
  return (
    <>
      <ShowPackedToggle value={value} onChange={setValue} />
      <div>{`packed:${value}`}</div>
    </>
  );
}

describe('useShowPacked', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('defaults to off', () => {
    renderWithMantine(<Harness />);
    expect(screen.getByText('packed:false')).toBeTruthy();
  });

  it('reads the stored value', () => {
    localStorage.setItem('personViewShowPacked', 'true');
    renderWithMantine(<Harness />);
    expect(screen.getByText('packed:true')).toBeTruthy();
    expect((screen.getByRole('switch', { name: 'Show packed' }) as HTMLInputElement).checked).toBe(true);
  });

  it('persists changes', async () => {
    renderWithMantine(<Harness />);
    await userEvent.click(screen.getByRole('switch', { name: 'Show packed' }));
    expect(localStorage.getItem('personViewShowPacked')).toBe('true');
    expect(screen.getByText('packed:true')).toBeTruthy();
  });
});
