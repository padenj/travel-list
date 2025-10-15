import React, { createContext, useContext, useEffect, useState } from 'react';
import { getFamilyPackingLists, getCurrentUserProfile } from '../api';

type ActiveContextValue = {
  activeListId: string | null;
  setActiveListId: (id: string | null) => void;
  availableLists: any[];
  refreshLists: () => Promise<void>;
  // React-centric way to request that a Manage UI open the edit modal for a list
  requestOpenEdit?: (listId: string) => void;
  pendingOpenEditId?: string | null;
  clearPendingOpenEdit?: () => void;
};

const ActivePackingListContext = createContext<ActiveContextValue | undefined>(undefined);

export const ActivePackingListProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [availableLists, setAvailableLists] = useState<any[]>([]);
  const [pendingOpenEditId, setPendingOpenEditId] = useState<string | null>(null);

  const refreshLists = async () => {
    try {
      const profile = await getCurrentUserProfile();
      const fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
      if (!fid) return;
      const res = await getFamilyPackingLists(fid);
      if (res.response.ok) {
        setAvailableLists(res.data.lists || []);
        // Prefer persisted selection from localStorage if present and still valid.
        const persisted = typeof window !== 'undefined' ? localStorage.getItem('activePackingListId') : null;
        const lists = res.data.lists || [];
        const persistedValid = persisted && lists.some((l: any) => l.id === persisted);
        if (persistedValid) {
          setActiveListId(persisted as string);
        } else {
          // If current activeListId is still valid keep it, otherwise do not auto-select any list
          if (activeListId && lists.some((l: any) => l.id === activeListId)) {
            // keep existing selection
          } else {
            setActiveListId(null);
          }
        }
      }
    } catch (err) {
      // ignore
    }
  };

  // Persisted setter wrapper
  const setAndPersistActiveListId = (id: string | null) => {
    setActiveListId(id);
    try {
      if (typeof window !== 'undefined') {
        if (id) localStorage.setItem('activePackingListId', id);
        else localStorage.removeItem('activePackingListId');
      }
    } catch (e) {
      // ignore localStorage errors
    }
  };

  useEffect(() => {
    refreshLists();
  }, []);

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
