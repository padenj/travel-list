import { describe, it, expect, vi } from 'vitest';

vi.mock('../api/tripApi', () => ({ tripApi: {} }));

import { destinationErrorText } from '../utils/destinationErrors';

describe('destinationErrorText', () => {
  it('explains the new trip rules', () => {
    expect(destinationErrorText(new Error('would_empty_destination'), 'x')).toBe('That would leave another destination with no travelers.');
    expect(destinationErrorText({ body: { error: 'last_destination' } }, 'x')).toBe('A trip needs at least one destination.');
    expect(destinationErrorText(new Error('invalid_shared_items_to'), 'x')).toBe('Choose where the shared items go.');
  });

  it('falls back for unknown codes', () => {
    expect(destinationErrorText(new Error('boom'), 'Something went wrong')).toBe('Something went wrong');
  });
});
