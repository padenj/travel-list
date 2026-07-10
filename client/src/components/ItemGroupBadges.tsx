import { Badge, Group } from '@mantine/core';

type ItemGroupBadgesProps = {
  names?: string[];
};

export default function ItemGroupBadges({ names }: ItemGroupBadgesProps) {
  const values = Array.isArray(names) ? names.filter((name): name is string => Boolean(name)) : [];
  if (values.length === 0) return null;

  return (
    <Group gap={6} wrap="wrap">
      {values.map((name) => (
        <Badge key={name} variant="light" size="xs">
          {name}
        </Badge>
      ))}
    </Group>
  );
}
