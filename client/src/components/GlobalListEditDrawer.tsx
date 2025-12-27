import React from 'react';
import { Drawer, Text } from '@mantine/core';
import { useListEditDrawer } from '../contexts/ListEditDrawerContext';

export default function GlobalListEditDrawer() {
  const { isOpen, close, renderFn } = useListEditDrawer();

  if (renderFn) return <>{isOpen ? renderFn() : null}</>;

  return (
    <Drawer opened={isOpen} onClose={close} title={`Edit Packing List`} position="right" size={720} padding="md">
      <div style={{ padding: 16 }}>
        <Text c="dimmed">List editor (compact mode)</Text>
      </div>
    </Drawer>
  );
}
