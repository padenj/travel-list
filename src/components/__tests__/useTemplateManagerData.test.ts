import { describe, it, expect, vi } from 'vitest';
import * as api from '../../api';
import { loadTemplatesData } from '../useTemplateManagerData';

vi.mock('../../api');

describe('loadTemplatesData', () => {
  it('loads templates and their categories/items', async () => {
    (api.getTemplates as any).mockResolvedValue({ response: { ok: true }, data: { templates: [{ id: 't1', name: 'Weekend' }] } });
    (api.getCategoriesForTemplate as any).mockResolvedValue({ response: { ok: true }, data: { categories: [{ id: 'c1', name: 'Clothing' }] } });
    (api.getItemsForTemplate as any).mockResolvedValue({ response: { ok: true }, data: { items: [{ id: 'i1', name: 'T-Shirt' }] } });

    const result = await loadTemplatesData('fam-1');

    expect(api.getTemplates).toHaveBeenCalledWith('fam-1');
    expect(api.getCategoriesForTemplate).toHaveBeenCalledWith('t1');
    expect(api.getItemsForTemplate).toHaveBeenCalledWith('t1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
    expect(result[0].categories).toEqual([{ id: 'c1', name: 'Clothing' }]);
    expect(result[0].items).toEqual([{ id: 'i1', name: 'T-Shirt' }]);
  });
});
