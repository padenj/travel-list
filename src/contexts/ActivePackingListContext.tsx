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
        const active = (res.data.lists || []).find((l: any) => l.active) || (res.data.lists || [])[0];
        if (active) setActiveListId(active.id);
      }
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    refreshLists();
  }, []);

  const requestOpenEdit = (listId: string) => setPendingOpenEditId(listId);
  const clearPendingOpenEdit = () => setPendingOpenEditId(null);

  return (
    <ActivePackingListContext.Provider value={{ activeListId, setActiveListId, availableLists, refreshLists, requestOpenEdit, pendingOpenEditId, clearPendingOpenEdit }}>
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
