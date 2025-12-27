import { useEffect } from 'react';
import { Select, Group } from '@mantine/core';
import { useActivePackingList } from '../contexts/ActivePackingListContext';

export default function ActivePackingListSelector({ onChange }: { onChange?: (listId: string | null) => void }) {
  const { activeListId, setActiveListId, availableLists, refreshLists } = useActivePackingList();

  useEffect(() => {
    // ensure the available lists are loaded when the selector mounts
    refreshLists();
  }, []);

  const handleSelect = (id: string | null) => {
    // Allow clearing selection
    setActiveListId(id);
    onChange && onChange(id);
  };

  return (
    <div>
      <Group align="center">
        <Select
          data={[{ value: '', label: '-- select active list --' }, ...availableLists.map(l => ({ value: l.id, label: l.name }))]}
          value={activeListId || ''}
          onChange={(v) => handleSelect(v || null)}
          style={{ minWidth: 260 }}
        />
      </Group>
    </div>
  );
}
