import { useState } from 'react';
import { Stack, TextInput, Button, Checkbox, Group, Card, Title } from '@mantine/core';

export interface CategoryFormProps {
  categories: { id: string; name: string }[];
  onAddCategory: (name: string) => void;
  selectedCategoryIds: string[];
  onSelectCategory: (ids: string[]) => void;
}

export function CategoryForm({ categories, onAddCategory, selectedCategoryIds, onSelectCategory }: CategoryFormProps) {
  const [newCategory, setNewCategory] = useState('');

  const handleAdd = () => {
    if (newCategory.trim()) {
      onAddCategory(newCategory.trim());
      setNewCategory('');
    }
  };

  return (
    <Card withBorder>
      <Title order={5}>Categories</Title>
      <Stack>
        <Group>
          <TextInput
            placeholder="Add new category"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
          />
          <Button onClick={handleAdd} disabled={!newCategory.trim()}>
            Add
          </Button>
        </Group>
        <Checkbox.Group
          label="Select categories for this family"
          value={selectedCategoryIds}
          onChange={onSelectCategory}
        >
          {categories.map(cat => (
            <Checkbox key={cat.id} value={cat.id} label={cat.name} />
          ))}
        </Checkbox.Group>
      </Stack>
    </Card>
  );
}
