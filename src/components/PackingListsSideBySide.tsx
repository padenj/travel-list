import { Card, Text, Stack, Checkbox, Group, ScrollArea, ActionIcon } from '@mantine/core';
import { IconX, IconArrowLeft, IconPlus } from '@tabler/icons-react';

export interface PackingListProps {
  userLists: { userId: string; userName: string; items: { id: string; name: string; checked: boolean; masterId?: string | null }[] }[];
  wholeFamilyItems: { id: string; name: string; checked: boolean; masterId?: string | null }[];
  onCheckItem: (userId: string | null, itemId: string, checked: boolean) => void;
  notNeededByUser?: Record<string, string[]>;
  notNeededWhole?: string[];
  onToggleNotNeeded?: (userId: string | null, itemId: string) => void;
  onOpenAddDrawer?: (userId: string | null) => void;
}

const ItemLabel: React.FC<{ text: string }> = ({ text }) => (
  <span style={{ fontSize: 13, lineHeight: '1.1', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
);

export function PackingListsSideBySide({ userLists, wholeFamilyItems, onCheckItem, notNeededByUser = {}, notNeededWhole = [], onToggleNotNeeded, onOpenAddDrawer }: PackingListProps) {
  return (
    <Group align="flex-start" grow style={{ gap: 8 }}>
      {userLists.map(list => (
        <Card key={list.userId} withBorder style={{ minWidth: 200, padding: 8, maxHeight: '60vh' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text size="sm" fw={600}>{list.userName}'s List</Text>
            {onOpenAddDrawer ? (
              <ActionIcon size="sm" variant="light" onClick={() => onOpenAddDrawer(list.userId)} aria-label="Add one-off">
                <IconPlus size={14} />
              </ActionIcon>
            ) : null}
          </div>
          <ScrollArea style={{ height: '50vh' }}>
            <Stack style={{ gap: 6 }}>
              {list.items.length === 0 ? (
                <span style={{ color: '#888', fontSize: 13 }}>No items assigned</span>
              ) : (
                (() => {
                  const notNeeded = new Set(notNeededByUser[list.userId] || []);
                  const oneOff = list.items.filter(i => i.masterId == null);
                  const regular = list.items.filter(i => i.masterId != null);
                  const active = regular.filter(i => !notNeeded.has(i.id));
                  const dismissed = regular.filter(i => notNeeded.has(i.id));
                  const oneOffActive = oneOff.filter(i => !notNeeded.has(i.id));
                  return (
                    <div>
                      {oneOffActive.length > 0 ? (
                        <div style={{ marginBottom: 6 }}>
                          <Text size="xs" fw={700}>One-off</Text>
                          {oneOffActive.map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                              <Checkbox
                                checked={item.checked}
                                onChange={e => onCheckItem(list.userId, item.id, e.target.checked)}
                                styles={{ body: { padding: 0 } }}
                                aria-label={item.name}
                              />
                              <ItemLabel text={item.name} />
                              {onToggleNotNeeded ? (
                                <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Not needed">
                                  <IconX size={14} />
                                </ActionIcon>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {active.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                          <Checkbox
                            checked={item.checked}
                            onChange={e => onCheckItem(list.userId, item.id, e.target.checked)}
                            styles={{ body: { padding: 0 } }}
                            aria-label={item.name}
                          />
                          <ItemLabel text={item.name} />
                          {onToggleNotNeeded ? (
                            <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Not needed">
                              <IconX size={14} />
                            </ActionIcon>
                          ) : null}
                        </div>
                      ))}

                      {dismissed.length > 0 ? (
                        <div style={{ marginTop: 8 }}>
                          <Text size="xs" c="dimmed">Not needed</Text>
                          {dismissed.map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', color: '#888' }}>
                              <Checkbox disabled checked={item.checked} onChange={e => onCheckItem(list.userId, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.name} />
                              <ItemLabel text={item.name} />
                              {onToggleNotNeeded ? (
                                <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(list.userId, item.id)} aria-label="Move to active">
                                  <IconArrowLeft size={14} />
                                </ActionIcon>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })()
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
              (() => {
                const notNeeded = new Set(notNeededWhole || []);
                const active = wholeFamilyItems.filter(i => !notNeeded.has(i.id));
                const dismissed = wholeFamilyItems.filter(i => notNeeded.has(i.id));
                return (
                  <div>
                    {active.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                        <Checkbox
                          checked={item.checked}
                          onChange={e => onCheckItem(null, item.id, e.target.checked)}
                          styles={{ body: { padding: 0 } }}
                          aria-label={item.name}
                        />
                        <ItemLabel text={item.name} />
                        {onToggleNotNeeded ? (
                          <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Not needed">
                            <IconX size={14} />
                          </ActionIcon>
                        ) : null}
                      </div>
                    ))}

                    {dismissed.length > 0 ? (
                      <div style={{ marginTop: 8 }}>
                        <Text size="xs" c="dimmed">Not needed</Text>
                        {dismissed.map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', color: '#888' }}>
                            <Checkbox disabled checked={item.checked} onChange={e => onCheckItem(null, item.id, e.target.checked)} styles={{ body: { padding: 0 } }} aria-label={item.name} />
                            <ItemLabel text={item.name} />
                            {onToggleNotNeeded ? (
                              <ActionIcon size="sm" variant="subtle" onClick={() => onToggleNotNeeded(null, item.id)} aria-label="Move to active">
                                <IconArrowLeft size={14} />
                              </ActionIcon>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })()
            )}
          </Stack>
        </ScrollArea>
      </Card>
    </Group>
  );
}
