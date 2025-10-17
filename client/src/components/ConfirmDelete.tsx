import React, { useEffect, useRef, useState } from 'react';
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { IconTrash, IconCheck, IconX } from '@tabler/icons-react';

type ConfirmDeleteProps = {
  onConfirm: () => Promise<void> | void;
  title?: string; // tooltip/title for the trash button
  confirmText?: string;
  timeoutMs?: number; // auto-cancel timeout in ms
  disabled?: boolean;
};

export default function ConfirmDelete({ onConfirm, title = 'Delete', confirmText = 'Delete?', timeoutMs = 5000, disabled }: ConfirmDeleteProps) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (confirming && timeoutMs > 0) {
      timerRef.current = window.setTimeout(() => setConfirming(false), timeoutMs);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [confirming, timeoutMs]);

  const handleStart = () => {
    if (disabled) return;
    setConfirming(true);
  };

  const handleCancel = () => {
    setConfirming(false);
  };

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  if (!confirming) {
    return (
      <Tooltip label={title} withArrow>
        <span>
          <ActionIcon color="red" variant="light" onClick={handleStart} title={title} disabled={disabled}>
            <IconTrash size={16} />
          </ActionIcon>
        </span>
      </Tooltip>
    );
  }

  return (
    <Group gap={6}>
      <Text size="sm" color="red">{confirmText}</Text>
      <ActionIcon color="green" variant="light" onClick={handleConfirm} title="Confirm delete">
        <IconCheck size={16} />
      </ActionIcon>
      <ActionIcon color="gray" variant="light" onClick={handleCancel} title="Cancel">
        <IconX size={16} />
      </ActionIcon>
    </Group>
  );
}
