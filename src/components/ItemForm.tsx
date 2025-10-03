import React, { useState } from 'react';
import { Stack, TextInput, Button, Checkbox, Group, Card, Title } from '@mantine/core';

export interface ItemFormProps {
  items: { id: string; name: string }[];
  onAddItem: (name: string) => void;
  selectedItemIds: string[];
  onSelectItem: (ids: string[]) => void;
}

export function ItemForm({ items, onAddItem, selectedItemIds, onSelectItem }: ItemFormProps) {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    if (newItem.trim()) {
      onAddItem(newItem.trim());
      setNewItem('');
    }
  };

  return (
    <Card withBorder>
      <Title order={5}>Items</Title>
      <Stack>
        <Group>
          <TextInput
            placeholder="Add new item"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
          />
          <Button onClick={handleAdd} disabled={!newItem.trim()}>
            Add
          </Button>
        </Group>
        <Checkbox.Group
          label="Select items for this family"
          value={selectedItemIds}
          onChange={onSelectItem}
        >
          {items.map(item => (
            <Checkbox key={item.id} value={item.id} label={item.name} />
          ))}
        </Checkbox.Group>
      </Stack>
    </Card>
  );
}
