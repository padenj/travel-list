import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../contexts/ImpersonationContext', () => ({
  useImpersonation: () => ({ impersonatingFamilyId: null, impersonatingFamilyName: null, stopImpersonation: vi.fn() }),
}));
vi.mock('./../components/VersionText', () => ({ default: () => null }));
vi.mock('./../components/ServiceWorkerStatus', () => ({ default: () => null }));
vi.mock('./../components/GlobalListEditDrawer', () => ({ default: () => null }));

import SplitRailLayout from '../components/SplitRailLayout';

function renderAt(path: string, role: string) {
  return renderWithMantine(
    <MemoryRouter initialEntries={[path]}>
      <SplitRailLayout user={{ username: 'kid', role }} onLogout={vi.fn()}>
        <div>content</div>
      </SplitRailLayout>
    </MemoryRouter>,
  );
}

const hrefs = () => screen.queryAllByRole('link').map((a) => a.getAttribute('href'));

describe('SplitRailLayout settings navigation', () => {
  it('gives family members a Settings entry that opens payment methods only', () => {
    renderAt('/settings/payment-methods', 'FamilyMember');
    expect(hrefs()).toContain('/settings/payment-methods');
    expect(hrefs()).not.toContain('/settings/profile');
    expect(hrefs()).not.toContain('/settings/family');
    expect(hrefs()).not.toContain('/settings/security');
  });

  it('keeps every settings tab for family admins', () => {
    renderAt('/settings/profile', 'FamilyAdmin');
    for (const path of ['/settings/profile', '/settings/family', '/settings/security', '/settings/payment-methods']) {
      expect(hrefs()).toContain(path);
    }
  });
});
