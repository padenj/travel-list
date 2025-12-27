import { getTemplates, getCategoriesForTemplate, getItemsForTemplate } from '../api';

export async function loadTemplatesData(familyId: string) {
  const res = await getTemplates(familyId);
  const templates = (res && res.data && res.data.templates) || [];

  const detailed = await Promise.all(
    templates.map(async (t: any) => {
      const [catsRes, itemsRes] = await Promise.all([
        getCategoriesForTemplate(t.id),
        getItemsForTemplate(t.id),
      ]);
      return {
        ...t,
        categories: (catsRes && catsRes.data && catsRes.data.categories) || [],
        items: (itemsRes && itemsRes.data && itemsRes.data.items) || [],
      };
    })
  );

  return detailed;
}

export default loadTemplatesData;
