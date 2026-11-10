import { Alert, Button, Group, Stack, Text } from '@mantine/core';

export interface MemberConflictAlertProps {
  who: string;
  destinationName: string;
  onlyMember: boolean;
  moving?: boolean;
  loading?: boolean;
  offline?: boolean;
  onMove: () => void;
  onDismiss: () => void;
}

/** Shown for a 409 `member_in_other_destination`: offers to move the person, or explains why that isn't possible. */
export default function MemberConflictAlert({ who, destinationName, onlyMember, moving, loading, offline, onMove, onDismiss }: MemberConflictAlertProps) {
  return (
    <Alert color="yellow">
      <Stack gap="xs">
        {onlyMember ? (
          <>
            <Text size="sm">
              {`${who} is the only person in ${destinationName} on this trip. Remove that destination on the trip page first, or choose a different destination for ${who}.`}
            </Text>
            <Group gap="xs">
              <Button size="compact-sm" variant="default" onClick={onDismiss}>Got it</Button>
            </Group>
          </>
        ) : (
          <>
            <Text size="sm">{`${who} is already in ${destinationName} on this trip. Move them here?`}</Text>
            <Group gap="xs">
              <Button size="compact-sm" onClick={onMove} loading={moving} disabled={offline || loading}>{offline ? 'Needs a connection' : 'Move'}</Button>
              <Button size="compact-sm" variant="default" onClick={onDismiss}>Cancel</Button>
            </Group>
          </>
        )}
      </Stack>
    </Alert>
  );
}
