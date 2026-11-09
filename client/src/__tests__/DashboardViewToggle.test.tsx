/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine, setMobileViewport } from '../test-utils/renderWithMantine';
import DashboardViewToggle, { useDashboardViewMode } from '../components/DashboardViewToggle';
import NotesDestinationPicker from '../components/NotesDestinationPicker';

function Harness() {
  const [mode, setMode] = useDashboardViewMode();
  return (
    <>
      <DashboardViewToggle value={mode} onChange={setMode} />
      <div>{`mode:${mode}`}</div>
    </>
  );
}

describe('useDashboardViewMode', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    setMobileViewport(false);
  });

  it('defaults to Person on phones', () => {
    setMobileViewport(true);
    renderWithMantine(<Harness />);
    expect(screen.getByText('mode:person')).toBeTruthy();
  });

  it('defaults to Columns on wider screens', () => {
    renderWithMantine(<Harness />);
    expect(screen.getByText('mode:columns')).toBeTruthy();
  });

  it('remembers the choice on this device', async () => {
    setMobileViewport(true);
    renderWithMantine(<Harness />);
    await userEvent.click(screen.getByText('Columns'));
    expect(screen.getByText('mode:columns')).toBeTruthy();
    expect(localStorage.getItem('dashboardView')).toBe('columns');
  });
});

describe('NotesDestinationPicker', () => {
  afterEach(cleanup);

  it('renders nothing for a single group', () => {
    const { container } = renderWithMantine(
      <NotesDestinationPicker groups={[{ listId: 'l1', name: 'Beach' }]} value="l1" onChange={() => {}} />
    );
    expect(container.querySelector('input')).toBeNull();
  });

  it('shows the selected destination', () => {
    renderWithMantine(
      <NotesDestinationPicker groups={[{ listId: 'l1', name: 'Paris' }, { listId: 'l2', name: "Grandma's" }]} value="l2" onChange={() => {}} />
    );
    expect((screen.getByRole('textbox', { name: 'Notes destination' }) as HTMLInputElement).value).toBe("Grandma's");
  });
});
