import { createContext, useContext, useEffect } from 'react';

// Mantine closes every open modal on Escape (window capture listeners), so a dialog that hosts
// nested modals turns its own Escape off while any of them reports itself open.
export const NestedModalContext = createContext<((open: boolean) => void) | null>(null);

export function useReportNestedModal(opened: boolean) {
  const report = useContext(NestedModalContext);
  useEffect(() => {
    if (!report || !opened) return;
    report(true);
    return () => report(false);
  }, [report, opened]);
}
