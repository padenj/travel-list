import React, { createContext, useContext, useState } from 'react';

type RefreshContextType = {
  refreshKey: number;
  bumpRefresh: () => void;
};

const RefreshContext = createContext<RefreshContextType>({
  refreshKey: 0,
  bumpRefresh: () => {}
});

export const useRefresh = () => useContext(RefreshContext);

export const RefreshProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = () => setRefreshKey(k => k + 1);
  return (
    <RefreshContext.Provider value={{ refreshKey, bumpRefresh }}>
      {children}
    </RefreshContext.Provider>
  );
};

export default RefreshContext;
