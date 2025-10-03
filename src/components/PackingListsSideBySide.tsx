import React from 'react';
import { Card, Title, Stack, Checkbox, Group, Divider } from '@mantine/core';

export interface PackingListProps {
  userLists: { userId: string; userName: string; items: { id: string; name: string; checked: boolean }[] }[];
  wholeFamilyItems: { id: string; name: string; checked: boolean }[];
  onCheckItem: (userId: string | null, itemId: string, checked: boolean) => void;
}

export function PackingListsSideBySide({ userLists, wholeFamilyItems, onCheckItem }: PackingListProps) {
  return (
    <Group align="flex-start" grow>
      {userLists.map(list => (
        <Card key={list.userId} withBorder style={{ minWidth: 220 }}>
          <Title order={5} mb="sm">{list.userName}'s List</Title>
          <Stack>
            {list.items.length === 0 ? (
              <span style={{ color: '#888' }}>No items assigned</span>
            ) : (
              list.items.map(item => (
                <Checkbox
                  key={item.id}
                  label={item.name}
                  checked={item.checked}
                  onChange={e => onCheckItem(list.userId, item.id, e.target.checked)}
                />
              ))
            )}
          </Stack>
        </Card>
      ))}
      <Card withBorder style={{ minWidth: 220 }}>
        <Title order={5} mb="sm">Whole Family</Title>
        <Stack>
          {wholeFamilyItems.length === 0 ? (
            <span style={{ color: '#888' }}>No items assigned</span>
          ) : (
            wholeFamilyItems.map(item => (
              <Checkbox
                key={item.id}
                label={item.name}
                checked={item.checked}
                onChange={e => onCheckItem(null, item.id, e.target.checked)}
              />
            ))
          )}
        </Stack>
      </Card>
    </Group>
  );
}
