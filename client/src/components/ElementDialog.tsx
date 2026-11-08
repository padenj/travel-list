import { ReactNode, TouchEvent, useRef, useState } from 'react';
import { Badge, Modal, Tabs } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { getSwipeDirection, isSwipeBlocked } from '../utils/swipe';

export interface ElementDialogTab {
  value: string;
  label: string;
  count?: number;
  content: ReactNode;
}

interface ElementDialogProps {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  tabs: ElementDialogTab[];
  swipeEnabled?: boolean;
}

export function ElementDialog({ opened, onClose, title, tabs, swipeEnabled = true }: ElementDialogProps) {
  const isMobile = Boolean(useMediaQuery('(max-width: 48em)'));
  const [active, setActive] = useState(tabs[0]?.value ?? '');
  const bodyRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current =
      swipeEnabled && touch && !isSwipeBlocked(event.target, bodyRef.current)
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const direction = getSwipeDirection(start, { x: touch.clientX, y: touch.clientY });
    if (!direction) return;

    const index = tabs.findIndex(tab => tab.value === active);
    const next = tabs[index + (direction === 'left' ? 1 : -1)];
    if (next) setActive(next.value);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg" fullScreen={isMobile} centered={!isMobile}>
      <Tabs value={active} onChange={value => value && setActive(value)} keepMounted={false}>
        <Tabs.List grow>
          {tabs.map(tab => (
            <Tabs.Tab
              key={tab.value}
              value={tab.value}
              rightSection={tab.count ? <Badge size="xs" circle>{tab.count}</Badge> : undefined}
            >
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <div ref={bodyRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ touchAction: 'pan-y' }}>
          {tabs.map(tab => (
            <Tabs.Panel key={tab.value} value={tab.value} pt="md">
              {tab.content}
            </Tabs.Panel>
          ))}
        </div>
      </Tabs>
    </Modal>
  );
}
