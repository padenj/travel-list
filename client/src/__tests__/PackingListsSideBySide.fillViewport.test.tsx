/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { PackingListsSideBySide } from '../components/PackingListsSideBySide';

const props = {
  userLists: [{ userId: 'u1', userName: 'Dad', items: [] }],
  wholeFamilyItems: [],
  onCheckItem: vi.fn(),
};

describe('PackingListsSideBySide fillViewport', () => {
  afterEach(cleanup);

  it('sets no fixed height on columns when fillViewport is false', () => {
    renderWithMantine(<PackingListsSideBySide {...props} fillViewport={false} />);
    const col = screen.getAllByLabelText(/^Collapse .* column$/)[0].closest('div[style*="min-width"]') as HTMLElement;
    expect(col).toBeTruthy();
    expect(col.style.height).toBe('');
  });

  it('keeps a fixed height by default', () => {
    renderWithMantine(<PackingListsSideBySide {...props} />);
    const col = screen.getAllByLabelText(/^Collapse .* column$/)[0].closest('div[style*="min-width"]') as HTMLElement;
    expect(col.style.height).not.toBe('');
  });
});
