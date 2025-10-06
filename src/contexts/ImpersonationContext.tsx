import React, { createContext, useContext, useState, useEffect } from 'react';
import { getFamily } from '../api';

interface ImpersonationContextType {
  impersonatingFamilyId: string | null;
  impersonatingFamilyName: string | null;
  startImpersonation: (familyId: string) => void;
  stopImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  impersonatingFamilyId: null,
  impersonatingFamilyName: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
});

export const useImpersonation = () => useContext(ImpersonationContext);

export const ImpersonationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const STORAGE_KEY_ID = 'impersonationFamilyId';
  const STORAGE_KEY_NAME = 'impersonationFamilyName';

  const [impersonatingFamilyId, setImpersonatingFamilyId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_ID) || null;
    } catch {
      return null;
    }
  });

  const [impersonatingFamilyName, setImpersonatingFamilyName] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_NAME) || null;
    } catch {
      return null;
    }
  });

  // Load family name whenever impersonation target changes
  useEffect(() => {
    async function fetchName() {
      if (!impersonatingFamilyId) {
        setImpersonatingFamilyName(null);
        return;
      }
      try {
        const res = await getFamily(impersonatingFamilyId);
        if (res.response.ok && res.data.family) {
          setImpersonatingFamilyName(res.data.family.name || impersonatingFamilyId);
        } else {
          setImpersonatingFamilyName(impersonatingFamilyId);
        }
      } catch {
        setImpersonatingFamilyName(impersonatingFamilyId);
      }
    }
    fetchName();
  }, [impersonatingFamilyId]);

  const startImpersonation = (familyId: string) => {
    console.log('[Impersonation] startImpersonation:', familyId);
    try { sessionStorage.setItem(STORAGE_KEY_ID, familyId); } catch {}
    setImpersonatingFamilyId(familyId);
  };

  const stopImpersonation = () => {
    console.log('[Impersonation] stopImpersonation');
    try { sessionStorage.removeItem(STORAGE_KEY_ID); sessionStorage.removeItem(STORAGE_KEY_NAME); } catch {}
    setImpersonatingFamilyId(null);
    setImpersonatingFamilyName(null);
  };

  return (
    <ImpersonationContext.Provider value={{ impersonatingFamilyId, impersonatingFamilyName, startImpersonation, stopImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  );
};

export default ImpersonationContext;
