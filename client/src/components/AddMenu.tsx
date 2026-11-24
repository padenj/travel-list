import { Button, Menu } from '@mantine/core';
import { IconBed, IconPlane, IconPlus } from '@tabler/icons-react';

interface AddMenuProps {
  onAddFlight: () => void;
  onAddLodging: () => void;
  className?: string;
}

export function AddMenu({ onAddFlight, onAddLodging, className }: AddMenuProps) {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button className={className} leftSection={<IconPlus size={16} />}>Add</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPlane size={14} />} onClick={onAddFlight}>Flight</Menu.Item>
        <Menu.Item leftSection={<IconBed size={14} />} onClick={onAddLodging}>Lodging</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
