// @vitest-environment jsdom
import { describe as _describe, it as _it, expect as _expect, beforeEach as _beforeEach, beforeAll as _beforeAll, vi as _vi } from 'vitest';
import * as api from '../api';

let hasTestingLibs = true;
try {
  require.resolve('@testing-library/react');
} catch (e) {
  hasTestingLibs = false;
}

if (!hasTestingLibs) {
  _describe.skip('ActivePackingListContext (component tests skipped - install testing libs)', () => {});
} else {
  const rtl = require('@testing-library/react');
  const React = require('react');
  const { render, screen, waitFor, cleanup, act } = rtl;

  const { describe, it, expect, beforeEach, beforeAll, vi } = {
    describe: _describe,
    it: _it,
    expect: _expect,
    beforeEach: _beforeEach,
    beforeAll: _beforeAll,
    vi: _vi,
  };

  var mockedImpersonatingFamilyId: string | null = null;

  vi.mock('../api');
  vi.mock('../contexts/ImpersonationContext', () => ({
    useImpersonation: () => ({ impersonatingFamilyId: mockedImpersonatingFamilyId }),
  }));

  let ActivePackingListProvider: any;
  let useActivePackingList: any;

  const Probe = () => {
    const { activeListId } = useActivePackingList();
    return <div data-testid="active-list-id">{activeListId || ''}</div>;
  };

  const mockProfile = ({ familyId, activeListId }: { familyId: string; activeListId: string | null }) => {
    (api.getCurrentUserProfile as any).mockResolvedValue({
      response: { ok: true },
      data: {
        family: {
          id: familyId,
          active_packing_list_id: activeListId,
        },
      },
    });
  };

  const mockLists = (ids: string[]) => {
    (api.getFamilyPackingLists as any).mockResolvedValue({
      response: { ok: true },
      data: {
        lists: ids.map(id => ({ id, name: id })),
      },
    });
  };

  const mockFamily = ({ familyId, activeListId }: { familyId: string; activeListId: string | null }) => {
    (api.getFamily as any).mockResolvedValue({
      response: { ok: true },
      data: {
        family: {
          id: familyId,
          active_packing_list_id: activeListId,
        },
      },
    });
  };

  beforeAll(async () => {
    const mod = await import('../contexts/ActivePackingListContext');
    ActivePackingListProvider = mod.ActivePackingListProvider;
    useActivePackingList = mod.useActivePackingList;
  });

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockedImpersonatingFamilyId = null;
    localStorage.clear();
  });

  it('defaults to family active list when no override exists', async () => {
    mockProfile({ familyId: 'f1', activeListId: 'list-a' });
    mockLists(['list-a', 'list-b']);

    render(
      <ActivePackingListProvider>
        <Probe />
      </ActivePackingListProvider>
    );

    await waitFor(() => expect(screen.getByTestId('active-list-id').textContent).toBe('list-a'));
  });

  it('keeps override only when baseFamilyActiveListId matches current family active', async () => {
    localStorage.setItem('activePackingListOverride:f1', JSON.stringify({
      overrideListId: 'list-b',
      baseFamilyActiveListId: 'list-a',
    }));
    mockProfile({ familyId: 'f1', activeListId: 'list-a' });
    mockLists(['list-a', 'list-b']);

    render(
      <ActivePackingListProvider>
        <Probe />
      </ActivePackingListProvider>
    );

    await waitFor(() => expect(screen.getByTestId('active-list-id').textContent).toBe('list-b'));
  });

  it('clears stale override when family active changed while user was offline', async () => {
    localStorage.setItem('activePackingListOverride:f1', JSON.stringify({
      overrideListId: 'list-b',
      baseFamilyActiveListId: 'list-a',
    }));
    mockProfile({ familyId: 'f1', activeListId: 'list-c' });
    mockLists(['list-b', 'list-c']);

    render(
      <ActivePackingListProvider>
        <Probe />
      </ActivePackingListProvider>
    );

    await waitFor(() => expect(screen.getByTestId('active-list-id').textContent).toBe('list-c'));
    expect(localStorage.getItem('activePackingListOverride:f1')).toBeNull();
  });

  it('switches immediately and clears override on server-event type family_active_list_changed', async () => {
    localStorage.setItem('activePackingListOverride:f1', JSON.stringify({
      overrideListId: 'list-b',
      baseFamilyActiveListId: 'list-a',
    }));
    mockProfile({ familyId: 'f1', activeListId: 'list-a' });
    mockLists(['list-a', 'list-b', 'list-c']);

    render(
      <ActivePackingListProvider>
        <Probe />
      </ActivePackingListProvider>
    );

    await waitFor(() => expect(screen.getByTestId('active-list-id').textContent).toBe('list-b'));

    act(() => {
      window.dispatchEvent(new CustomEvent('server-event', {
        detail: { type: 'family_active_list_changed', familyId: 'f1', listId: 'list-c' },
      }));
    });

    await waitFor(() => expect(screen.getByTestId('active-list-id').textContent).toBe('list-c'));
    expect(localStorage.getItem('activePackingListOverride:f1')).toBeNull();
  });

  it('uses impersonated family active list for override compatibility checks', async () => {
    mockedImpersonatingFamilyId = 'f2';
    localStorage.setItem('activePackingListOverride:f2', JSON.stringify({
      overrideListId: 'list-c',
      baseFamilyActiveListId: 'list-b',
    }));
    mockFamily({ familyId: 'f2', activeListId: 'list-b' });
    mockLists(['list-b', 'list-c']);

    render(
      <ActivePackingListProvider>
        <Probe />
      </ActivePackingListProvider>
    );

    await waitFor(() => expect(screen.getByTestId('active-list-id').textContent).toBe('list-c'));
    expect(api.getFamily).toHaveBeenCalledWith('f2');
  });

  it('clears stale override in impersonation mode when family active changed', async () => {
    mockedImpersonatingFamilyId = 'f2';
    localStorage.setItem('activePackingListOverride:f2', JSON.stringify({
      overrideListId: 'list-c',
      baseFamilyActiveListId: 'list-b',
    }));
    mockFamily({ familyId: 'f2', activeListId: 'list-d' });
    mockLists(['list-c', 'list-d']);

    render(
      <ActivePackingListProvider>
        <Probe />
      </ActivePackingListProvider>
    );

    await waitFor(() => expect(screen.getByTestId('active-list-id').textContent).toBe('list-d'));
    expect(localStorage.getItem('activePackingListOverride:f2')).toBeNull();
  });

  it('ignores family_active_list_changed events for a different family', async () => {
    localStorage.setItem('activePackingListOverride:f1', JSON.stringify({
      overrideListId: 'list-b',
      baseFamilyActiveListId: 'list-a',
    }));
    mockProfile({ familyId: 'f1', activeListId: 'list-a' });
    mockLists(['list-a', 'list-b', 'list-c']);

    render(
      <ActivePackingListProvider>
        <Probe />
      </ActivePackingListProvider>
    );

    await waitFor(() => expect(screen.getByTestId('active-list-id').textContent).toBe('list-b'));

    act(() => {
      window.dispatchEvent(new CustomEvent('server-event', {
        detail: { type: 'family_active_list_changed', familyId: 'f2', listId: 'list-c' },
      }));
    });

    await waitFor(() => expect(screen.getByTestId('active-list-id').textContent).toBe('list-b'));
    expect(localStorage.getItem('activePackingListOverride:f1')).not.toBeNull();
  });
}
