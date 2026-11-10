import { useEffect, useMemo } from 'react';
import { Select, Group } from '@mantine/core';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { buildListOptions, selectedOptionValue } from '../utils/listOptions';

export default function ActivePackingListSelector({ onChange }: { onChange?: (listId: string | null) => void }) {
  const { activeListId, setActiveListId, availableLists, refreshLists } = useActivePackingList();
  const options = useMemo(() => buildListOptions(availableLists || []), [availableLists]);

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
          data={[{ value: '', label: '-- select active list --' }, ...options.map(o => ({ value: o.value, label: o.label }))]}
          value={selectedOptionValue(options, activeListId)}
          onChange={(v) => handleSelect(v || null)}
          style={{ minWidth: 260 }}
        />
      </Group>
    </div>
  );
}
