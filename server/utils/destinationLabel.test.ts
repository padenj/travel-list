import { describe, it, expect } from 'vitest';
import { destinationListLabel, namesMatch } from './destinationLabel';

describe('destinationListLabel', () => {
  it('joins different names with a middle dot', () => {
    expect(destinationListLabel('Cabo', 'San Lucas')).toBe('Cabo · San Lucas');
  });

  it('uses only the trip name when the names are equal', () => {
    expect(destinationListLabel('Cabo', 'Cabo')).toBe('Cabo');
  });

  it('ignores case and surrounding spaces when comparing', () => {
    expect(destinationListLabel(' Cabo ', 'cABO  ')).toBe('Cabo');
  });

  it('trims both names in the joined label', () => {
    expect(destinationListLabel('  Cabo ', ' San Lucas ')).toBe('Cabo · San Lucas');
  });

  it('falls back to whichever name is present', () => {
    expect(destinationListLabel('', 'Paris')).toBe('Paris');
    expect(destinationListLabel('Spring Break', '')).toBe('Spring Break');
    expect(destinationListLabel(null, undefined)).toBe('');
  });
});

describe('namesMatch', () => {
  it('compares trimmed, case-insensitive names', () => {
    expect(namesMatch(' Spring Break', 'spring break ')).toBe(true);
    expect(namesMatch('Spring Break', 'Spring')).toBe(false);
    expect(namesMatch(null, '')).toBe(true);
  });
});
