import React, { createContext, useContext, useState } from 'react';

type ListEditDrawerContextValue = {
  openForList: (id: string, name?: string) => void;
  close: () => void;
  isOpen: boolean;
  listId: string | null;
  listName?: string | null;
  registerRender?: (fn: (() => React.ReactNode) | null) => void;
  renderFn?: (() => React.ReactNode) | null;
};

const ListEditDrawerContext = createContext<ListEditDrawerContextValue | undefined>(undefined);

export const ListEditDrawerProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [listId, setListId] = useState<string | null>(null);
  const [listName, setListName] = useState<string | null>(null);
  const [renderFn, setRenderFn] = useState<(() => React.ReactNode) | null>(null);

  const openForList = (id: string, name?: string) => {
    setListId(id);
    setListName(name || null);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setListId(null);
    setListName(null);
  };

  const registerRender = (fn: (() => React.ReactNode) | null) => setRenderFn(fn);

  return (
    <ListEditDrawerContext.Provider value={{ openForList, close, isOpen, listId, listName, registerRender, renderFn }}>
      {children}
    </ListEditDrawerContext.Provider>
  );
};

export const useListEditDrawer = () => {
  const ctx = useContext(ListEditDrawerContext);
  if (!ctx) throw new Error('useListEditDrawer must be used within ListEditDrawerProvider');
  return ctx;
};

export default ListEditDrawerContext;
