import { Stack } from '@mantine/core';
import { PackingListsSideBySide } from './PackingListsSideBySide';
import type { DestinationGroup } from '../utils/dashboardGroups';

export interface DestinationColumnsProps {
  groups: DestinationGroup[];
  isTrip: boolean;
  currentUserId: string | null;
  familyId: string | null;
  onCheckItem: (listId: string, userId: string | null, itemId: string, checked: boolean) => void;
  onItemNameClick: (listId: string, packingListItemId: string, name: string) => void;
  onToggleNotNeeded: (listId: string, userId: string | null, itemId: string) => void;
  onOpenAddDrawer: (listId: string, userId: string | null) => void;
  onRefresh: () => void;
}

export default function DestinationColumns({
  groups, isTrip, currentUserId, familyId, onCheckItem, onItemNameClick, onToggleNotNeeded, onOpenAddDrawer, onRefresh,
}: DestinationColumnsProps) {
  return (
    <Stack gap="lg">
      {groups.map(g => (
        <div key={g.listId}>
          {isTrip && (
            <h3
              style={{
                margin: '0 0 8px',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 16,
                color: `var(--mantine-color-${g.color || 'blue'}-light-color)`,
                background: `var(--mantine-color-${g.color || 'blue'}-light)`,
                borderLeft: `4px solid var(--mantine-color-${g.color || 'blue'}-filled)`,
              }}
            >
              {[g.name, g.members.map(m => m.name).join(', ')].filter(Boolean).join(' · ')}
            </h3>
          )}
          <PackingListsSideBySide
            userLists={g.userLists}
            wholeFamilyItems={g.wholeFamilyItems}
            wholeTitle={isTrip ? 'Shared' : 'Whole Family'}
            onCheckItem={(userId, itemId, checked) => onCheckItem(g.listId, userId, itemId, checked)}
            onItemNameClick={(pliId, name) => onItemNameClick(g.listId, pliId, name)}
            notNeededByUser={g.notNeededByUser}
            notNeededWhole={g.notNeededWhole}
            onToggleNotNeeded={(userId, itemId) => onToggleNotNeeded(g.listId, userId, itemId)}
            onOpenAddDrawer={userId => onOpenAddDrawer(g.listId, userId)}
            showWhole
            fillViewport={groups.length <= 1}
            activeListId={g.listId}
            familyId={familyId}
            onRefresh={onRefresh}
            currentUserId={currentUserId}
          />
        </div>
      ))}
    </Stack>
  );
}
