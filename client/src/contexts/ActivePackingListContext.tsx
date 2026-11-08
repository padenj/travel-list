import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getFamilyPackingLists, getCurrentUserProfile, getFamily } from '../api';
import { useImpersonation } from '../contexts/ImpersonationContext';

type ActiveContextValue = {
  activeListId: string | null;
  setActiveListId: (id: string | null) => void;
  availableLists: any[];
  // refreshLists now returns the fetched lists when available (or undefined on error)
  refreshLists: () => Promise<any[] | undefined>;
  // React-centric way to request that a Manage UI open the edit modal for a list
  requestOpenEdit?: (listId: string) => void;
  pendingOpenEditId?: string | null;
  clearPendingOpenEdit?: () => void;
};

const ActivePackingListContext = createContext<ActiveContextValue | undefined>(undefined);

type ActivePackingListOverride = {
  overrideListId: string;
  baseFamilyActiveListId: string | null;
};

const overrideKeyForFamily = (familyId: string) => `activePackingListOverride:${familyId}`;

const readOverride = (familyId: string): ActivePackingListOverride | null => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(overrideKeyForFamily(familyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.overrideListId !== 'string') return null;
    return {
      overrideListId: parsed.overrideListId,
      baseFamilyActiveListId: typeof parsed.baseFamilyActiveListId === 'string' || parsed.baseFamilyActiveListId === null
        ? parsed.baseFamilyActiveListId
        : null,
    };
  } catch {
    return null;
  }
};

const persistOverride = (familyId: string, value: ActivePackingListOverride | null) => {
  try {
    if (typeof window === 'undefined') return;
    if (!value) {
      localStorage.removeItem(overrideKeyForFamily(familyId));
      return;
    }
    localStorage.setItem(overrideKeyForFamily(familyId), JSON.stringify(value));
  } catch {
    // ignore localStorage errors
  }
};

export const ActivePackingListProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [availableLists, setAvailableLists] = useState<any[]>([]);
  const [pendingOpenEditId, setPendingOpenEditId] = useState<string | null>(null);
  const currentFamilyIdRef = useRef<string | null>(null);
  const familyActiveListIdRef = useRef<string | null>(null);
  const activeListIdRef = useRef<string | null>(null);

  // Prefer impersonation when present; fall back to the current user's profile
  const { impersonatingFamilyId } = useImpersonation() as any;

  const refreshLists = async (): Promise<any[] | undefined> => {
    try {
      // When impersonating we must not fall back to the logged-in user's profile.
      // Prefer the impersonation family id; if it's not present then fall back to profile.
      let fid: string | null = null;
      let familyActiveListId: string | null = null;
      if (impersonatingFamilyId) {
        fid = impersonatingFamilyId;
        try {
          const familyRes = await getFamily(fid);
          if (familyRes.response.ok && familyRes.data.family) {
            familyActiveListId = familyRes.data.family.active_packing_list_id || null;
          }
        } catch {
          familyActiveListId = null;
        }
      } else {
        const profile = await getCurrentUserProfile();
        if (profile.response.ok && profile.data.family) {
          fid = profile.data.family.id;
          familyActiveListId = profile.data.family.active_packing_list_id || null;
        }
      }
      if (!fid) return undefined;
      currentFamilyIdRef.current = fid;
      familyActiveListIdRef.current = familyActiveListId;

      const res = await getFamilyPackingLists(fid);
      if (res.response.ok) {
        const fetched = res.data.lists || [];
        setAvailableLists(fetched);
        const override = readOverride(fid);
        const overrideValid = !!override
          && override.baseFamilyActiveListId === familyActiveListId
          && fetched.some((l: any) => l.id === override.overrideListId);

        if (overrideValid) {
          setActiveListId(override!.overrideListId);
          return fetched;
        }

        if (override) {
          persistOverride(fid, null);
        }

        const familyActiveValid = !!familyActiveListId && fetched.some((l: any) => l.id === familyActiveListId);
        if (familyActiveValid) {
          setActiveListId(familyActiveListId);
        } else if (activeListIdRef.current && fetched.some((l: any) => l.id === activeListIdRef.current)) {
          setActiveListId(activeListIdRef.current);
        } else {
          setActiveListId(null);
        }
        return fetched;
      }
    } catch (err) {
      // ignore
    }
    return undefined;
  };

  // Persisted setter wrapper
  const setAndPersistActiveListId = (id: string | null) => {
    setActiveListId(id);
    const familyId = currentFamilyIdRef.current;
    if (!familyId) return;
    if (!id || id === familyActiveListIdRef.current) {
      persistOverride(familyId, null);
      return;
    }
    persistOverride(familyId, {
      overrideListId: id,
      baseFamilyActiveListId: familyActiveListIdRef.current ?? null,
    });
  };

  useEffect(() => {
    activeListIdRef.current = activeListId;
  }, [activeListId]);

  useEffect(() => {
    const handler = (ev: Event | CustomEvent<any>) => {
      const event = (ev as any)?.detail || ev;
      if (!event || event.type !== 'family_active_list_changed') return;
      const currentFamilyId = currentFamilyIdRef.current;
      if (!currentFamilyId || event.familyId !== currentFamilyId) return;
      familyActiveListIdRef.current = event.listId || null;
      persistOverride(currentFamilyId, null);
      setActiveListId(event.listId || null);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('server-event', handler as EventListener);
      return () => window.removeEventListener('server-event', handler as EventListener);
    }
    return undefined;
  }, [impersonatingFamilyId]);

  // Refresh lists initially and whenever impersonation changes so the available
  // lists reflect the impersonated family's lists when active.
  useEffect(() => {
    refreshLists();
  }, [impersonatingFamilyId]);

  const requestOpenEdit = (listId: string) => setPendingOpenEditId(listId);
  const clearPendingOpenEdit = () => setPendingOpenEditId(null);

  return (
    <ActivePackingListContext.Provider value={{ activeListId, setActiveListId: setAndPersistActiveListId, availableLists, refreshLists, requestOpenEdit, pendingOpenEditId, clearPendingOpenEdit }}>
      {children}
    </ActivePackingListContext.Provider>
  );
};

export const useActivePackingList = () => {
  const ctx = useContext(ActivePackingListContext);
  if (!ctx) throw new Error('useActivePackingList must be used within ActivePackingListProvider');
  return ctx;
};

export default ActivePackingListContext;
