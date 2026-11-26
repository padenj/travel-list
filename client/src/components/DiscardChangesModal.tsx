import { Button, Group, Modal, Text } from '@mantine/core';

interface DiscardChangesModalProps {
  opened: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}

export function DiscardChangesModal({ opened, onKeepEditing, onDiscard }: DiscardChangesModalProps) {
  return (
    <Modal opened={opened} onClose={onKeepEditing} title="Discard unsaved changes?" centered size="sm" zIndex={400}>
      <Text size="sm">You have changes that haven't been saved.</Text>
      <Group mt="md" justify="flex-end">
        <Button variant="default" onClick={onDiscard}>Discard</Button>
        <Button onClick={onKeepEditing} data-autofocus>Keep editing</Button>
      </Group>
    </Modal>
  );
}
