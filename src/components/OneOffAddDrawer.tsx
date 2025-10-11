import { useEffect, useState } from 'react';
import { Drawer, TextInput, Checkbox, Button, Group, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';

export interface OneOffAddDrawerProps {
  opened: boolean;
  onClose: () => void;
  defaultAssignedUserId?: string | null;
  familyMembers: { id: string; name?: string; username?: string }[];
  onAdd: (name: string, assignedMemberIds: string[]) => Promise<void>;
}

export default function OneOffAddDrawer({ opened, onClose, defaultAssignedUserId, familyMembers, onAdd }: OneOffAddDrawerProps) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName('');
    setSelected(defaultAssignedUserId ? [defaultAssignedUserId] : []);
  }, [opened, defaultAssignedUserId]);

  const handleToggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onAdd(name.trim(), selected);
      showNotification({ title: 'Added', message: 'One-off item added to the list', color: 'green' });
      onClose();
    } catch (err) {
      console.error('Failed to add one-off', err);
      showNotification({ title: 'Error', message: 'Failed to add item', color: 'red' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer opened={opened} onClose={onClose} title="Add one-off item" position="right" size={420} padding="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />

        <div>
          <Text size="sm" fw={600} mb={6}>Assign to</Text>
          {familyMembers.length === 0 ? (
            <Text c="dimmed">No family members</Text>
          ) : (
            familyMembers.map(m => (
              <div key={m.id} style={{ padding: '6px 0' }}>
                <Checkbox checked={selected.includes(m.id)} onChange={() => handleToggle(m.id)} label={m.name || m.username} />
              </div>
            ))
          )}
        </div>

  <Group style={{ justifyContent: 'flex-end' }}>
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAdd} loading={submitting} disabled={!name.trim()}>Add</Button>
        </Group>
      </div>
    </Drawer>
  );
}
