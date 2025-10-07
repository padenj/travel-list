import { Card, Text, Stack, Checkbox, Group, ScrollArea } from '@mantine/core';

export interface PackingListProps {
  userLists: { userId: string; userName: string; items: { id: string; name: string; checked: boolean; masterId?: string | null }[] }[];
  wholeFamilyItems: { id: string; name: string; checked: boolean; masterId?: string | null }[];
  onCheckItem: (userId: string | null, itemId: string, checked: boolean) => void;
}

const ItemLabel: React.FC<{ text: string }> = ({ text }) => (
  <span style={{ fontSize: 13, lineHeight: '1.1', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
);

export function PackingListsSideBySide({ userLists, wholeFamilyItems, onCheckItem }: PackingListProps) {
  return (
    <Group align="flex-start" grow style={{ gap: 8 }}>
      {userLists.map(list => (
        <Card key={list.userId} withBorder style={{ minWidth: 200, padding: 8, maxHeight: '60vh' }}>
          <Text size="sm" fw={600} style={{ marginBottom: 6 }}>{list.userName}'s List</Text>
          <ScrollArea style={{ height: '50vh' }}>
            <Stack style={{ gap: 6 }}>
              {list.items.length === 0 ? (
                <span style={{ color: '#888', fontSize: 13 }}>No items assigned</span>
              ) : (
                list.items.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                    <Checkbox
                      checked={item.checked}
                      onChange={e => onCheckItem(list.userId, item.id, e.target.checked)}
                      styles={{ body: { padding: 0 } }}
                      aria-label={item.name}
                    />
                    <ItemLabel text={item.name} />
                  </div>
                ))
              )}
            </Stack>
          </ScrollArea>
        </Card>
      ))}

      <Card withBorder style={{ minWidth: 200, padding: 8, maxHeight: '60vh' }}>
          <Text size="sm" fw={600} style={{ marginBottom: 6 }}>Whole Family</Text>
        <ScrollArea style={{ height: '50vh' }}>
          <Stack style={{ gap: 6 }}>
            {wholeFamilyItems.length === 0 ? (
              <span style={{ color: '#888', fontSize: 13 }}>No items assigned</span>
            ) : (
              wholeFamilyItems.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                  <Checkbox
                    checked={item.checked}
                    onChange={e => onCheckItem(null, item.id, e.target.checked)}
                    styles={{ body: { padding: 0 } }}
                    aria-label={item.name}
                  />
                  <ItemLabel text={item.name} />
                </div>
              ))
            )}
          </Stack>
        </ScrollArea>
      </Card>
    </Group>
  );
}
