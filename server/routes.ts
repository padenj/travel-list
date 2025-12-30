// Get whole family assignment for an item
// Get categories for an item


import express, { Request, Response, Router } from 'express';
import path from 'path';
import fs from 'fs';
import { logAudit } from './audit';
import { validatePassword, hashPassword, comparePassword, hashPasswordSync, comparePasswordSync, generateToken } from './auth';
import { authMiddleware, familyAccessMiddleware } from './middleware';
import { UserRepository, FamilyRepository, CategoryRepository, ItemRepository, updateCategoryPositions } from './repositories';
import { ERROR_CODES, USER_ROLES, HTTP_STATUS } from './constants';
import { User, LoginRequest, ChangePasswordRequest } from './server-types';
import { v4 as uuidv4 } from 'uuid';

// Extend Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const router: Router = express.Router();
const userRepo = new UserRepository();
const familyRepo = new FamilyRepository();
const categoryRepo = new CategoryRepository();
const itemRepo = new ItemRepository();

import { TemplateRepository } from './repositories';
import { seedTemplatesForFamily } from './seed-templates';
const templateRepo = new TemplateRepository();
import { PackingListRepository } from './repositories';
const packingListRepo = new PackingListRepository();
import { addClient, removeClient, broadcastEvent, getClients, sseLog } from './sse';

// Async propagation helper: when a template changes, update all packing lists assigned to it
function propagateTemplateToAssignedLists(templateId: string) {
  // run asynchronously to avoid blocking API responses
  setImmediate(async () => {
    try {
      const lists = await packingListRepo.getPackingListsForTemplate(templateId);
      for (const l of lists) {
        try {
          await packingListRepo.reconcilePackingListAgainstTemplate(l.id, templateId);
        } catch (err) {
          console.error('Error reconciling packing list from template during propagation', { listId: l.id, templateId, err });
        }
      }
    } catch (err) {
      console.error('Error during template propagation task for templateId', templateId, err);
    }
  });
}

// Note: family access enforcement is handled by familyAccessMiddleware in middleware.ts

// Template CRUD
router.post('/templates', authMiddleware, async (req: Request, res: Response) => {
  const { family_id, name, description } = req.body;
  if (!family_id || !name || name.trim() === '') {
    return res.status(400).json({ error: 'Family ID and template name are required' });
  }
  try {
    // Only SystemAdmin or FamilyAdmin for the target family may create templates
    if (req.user?.role !== 'SystemAdmin') {
      // if not system admin, ensure user is FamilyAdmin of the family_id
      const user = req.user;
      if (!user || user.familyId !== family_id || user.role !== 'FamilyAdmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    const template = await templateRepo.create({
      id: uuidv4(),
      family_id,
      name: name.trim(),
      description: description || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return res.json({ template });
  } catch (error) {
    console.error('Error creating template:', error);
    return res.status(500).json({ error: 'Failed to create template' });
  }
});

router.get('/templates/:familyId', authMiddleware, familyAccessMiddleware('familyId'), async (req: Request, res: Response) => {
  const { familyId } = req.params;
  try {
    const templates = await templateRepo.findAll(familyId);
    return res.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/template/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const template = await templateRepo.findById(id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    return res.json({ template });
  } catch (error) {
    console.error('Error fetching template:', error);
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.put('/template/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const existing = await templateRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    // Only SystemAdmin or FamilyAdmin for the template's family may update
    if (req.user?.role !== 'SystemAdmin') {
      if (req.user?.familyId !== existing.family_id || req.user.role !== 'FamilyAdmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    const updated = await templateRepo.update(id, updates);
  // enqueue propagation to assigned packing lists (async)
  propagateTemplateToAssignedLists(id);
  return res.json({ template: updated });
  } catch (error) {
    console.error('Error updating template:', error);
    return res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/template/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const existing = await templateRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    if (req.user?.role !== 'SystemAdmin') {
      if (req.user?.familyId !== existing.family_id || req.user.role !== 'FamilyAdmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    await templateRepo.softDelete(id);
    return res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting template:', error);
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Assign/remove categories/items to template
router.post('/template/:id/categories/:categoryId', authMiddleware, async (req: Request, res: Response) => {
  const { id, categoryId } = req.params;
  try {
    const existing = await templateRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    if (req.user?.role !== 'SystemAdmin') {
      if (req.user?.familyId !== existing.family_id || req.user.role !== 'FamilyAdmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    await templateRepo.assignCategory(id, categoryId);
  // propagate changes to assigned lists
  propagateTemplateToAssignedLists(id);
  return res.json({ message: 'Category assigned to template' });
  } catch (error) {
    console.error('Error assigning category:', error);
    return res.status(500).json({ error: 'Failed to assign category' });
  }
});

router.delete('/template/:id/categories/:categoryId', authMiddleware, async (req: Request, res: Response) => {
  const { id, categoryId } = req.params;
  try {
    const existing = await templateRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    if (req.user?.role !== 'SystemAdmin') {
      if (req.user?.familyId !== existing.family_id || req.user.role !== 'FamilyAdmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    await templateRepo.removeCategory(id, categoryId);
  propagateTemplateToAssignedLists(id);
  return res.json({ message: 'Category removed from template' });
  } catch (error) {
    console.error('Error removing category:', error);
    return res.status(500).json({ error: 'Failed to remove category' });
  }
});

router.post('/template/:id/items/:itemId', authMiddleware, async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  try {
    const existing = await templateRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    if (req.user?.role !== 'SystemAdmin') {
      if (req.user?.familyId !== existing.family_id || req.user.role !== 'FamilyAdmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    await templateRepo.assignItem(id, itemId);
  // Propagate changes to assigned lists synchronously to ensure consistency in tests
  try {
    const lists = await packingListRepo.getPackingListsForTemplate(id);
    for (const l of lists) {
      await packingListRepo.reconcilePackingListAgainstTemplate(l.id, id);
    }
  } catch (err) {
    console.error('Error propagating template changes synchronously', { templateId: id, err });
  }
  return res.json({ message: 'Item assigned to template' });
  } catch (error) {
    console.error('Error assigning item:', error);
    return res.status(500).json({ error: 'Failed to assign item' });
  }
});

router.delete('/template/:id/items/:itemId', authMiddleware, async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  try {
    const existing = await templateRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    if (req.user?.role !== 'SystemAdmin') {
      if (req.user?.familyId !== existing.family_id || req.user.role !== 'FamilyAdmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    await templateRepo.removeItem(id, itemId);
  // Propagate changes to assigned lists synchronously to ensure consistency in tests
  try {
    const lists = await packingListRepo.getPackingListsForTemplate(id);
    for (const l of lists) {
      await packingListRepo.reconcilePackingListAgainstTemplate(l.id, id);
    }
  } catch (err) {
    console.error('Error propagating template changes synchronously', { templateId: id, err });
  }
  return res.json({ message: 'Item removed from template' });
  } catch (error) {
    console.error('Error removing item:', error);
    return res.status(500).json({ error: 'Failed to remove item' });
  }
});

// Sync template items with a provided list of item IDs.
// Body: { itemIds: string[] }
router.post('/template/:id/sync-items', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { itemIds } = req.body as { itemIds?: string[] };
  if (!Array.isArray(itemIds)) {
    return res.status(400).json({ error: 'itemIds array is required' });
  }
  try {
    const existing = await templateRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    // Permission check: SystemAdmin or FamilyAdmin for the template's family
    if (req.user?.role !== 'SystemAdmin') {
      if (req.user?.familyId !== existing.family_id || req.user.role !== 'FamilyAdmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // Get current item assignments
    const currentRows = await templateRepo.getItems(id);
    const currentIds = currentRows.map((r: any) => r.item_id);

    // Determine adds and removes
    const toAdd = itemIds.filter(i => !currentIds.includes(i));
    const toRemove = currentIds.filter(i => !itemIds.includes(i));

    for (const itemId of toAdd) {
      await templateRepo.assignItem(id, itemId);
    }
    for (const itemId of toRemove) {
      await templateRepo.removeItem(id, itemId);
    }

  const updatedItems = await templateRepo.getItemsForTemplate(id);
  // propagate changes to assigned lists
  propagateTemplateToAssignedLists(id);
  return res.json({ templateId: id, items: updatedItems });
  } catch (error) {
    console.error('Error syncing template items:', error);
    return res.status(500).json({ error: 'Failed to sync template items' });
  }
});

// Get categories assigned to a template
router.get('/template/:id/categories', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const categories = await templateRepo.getCategoriesForTemplate(id);
    return res.json({ categories });
  } catch (error) {
    console.error('Error fetching template categories:', error);
    return res.status(500).json({ error: 'Failed to fetch template categories' });
  }
});

// Get items assigned to a template
router.get('/template/:id/items', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const items = await templateRepo.getItemsForTemplate(id);
    return res.json({ items });
  } catch (error) {
    console.error('Error fetching template items:', error);
    return res.status(500).json({ error: 'Failed to fetch template items' });
  }
});

// Get expanded items for a template (categories + items)
router.get('/template/:id/expanded-items', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const items = await templateRepo.getExpandedItems(id);
    return res.json({ items });
  } catch (error) {
    console.error('Error fetching expanded items:', error);
    return res.status(500).json({ error: 'Failed to fetch expanded items' });
  }
});

// Get categories for an item
router.get('/items/:itemId/categories', authMiddleware, async (req: Request, res: Response) => {
  const { itemId } = req.params;
  try {
    const categories = await itemRepo.getCategoriesForItem(itemId);
    return res.json({ categories });
  } catch (error) {
    console.error('Error fetching item categories:', error);
    return res.status(500).json({ error: 'Failed to fetch item categories' });
  }
});

// Update item checked state
router.put('/items/:id/checked', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { checked } = req.body;
  try {
    const updated = await itemRepo.setChecked(id, !!checked);
    return res.json({ item: updated });
  } catch (error) {
    console.error('Error updating item checked state:', error);
    return res.status(500).json({ error: 'Failed to update item checked state' });
  }
});
// Category CRUD endpoints
router.post('/categories', authMiddleware, async (req: Request, res: Response) => {
  const { familyId, name } = req.body;
  if (!familyId || !name || name.trim() === '') {
    return res.status(400).json({ error: 'Family ID and category name are required' });
  }
  try {
    const category = await categoryRepo.create({
      id: uuidv4(),
      familyId,
      name: name.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return res.json({ category });
  } catch (error) {
    console.error('Error creating category:', error);
    return res.status(500).json({ error: 'Failed to create category' });
  }
});

router.get('/categories/:familyId', authMiddleware, familyAccessMiddleware('familyId'), async (req: Request, res: Response) => {
  const { familyId } = req.params;
  try {
    const categories = await categoryRepo.findAll(familyId);
    return res.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get items for a specific category
router.get('/categories/:categoryId/items', authMiddleware, async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  try {
    const items = await itemRepo.getItemsForCategory(categoryId);
    // For each item, if wholeFamily is true, memberIds should be empty (already handled in repo)
    return res.json({ items });
  } catch (error) {
    console.error('Error fetching category items:', error);
    return res.status(500).json({ error: 'Failed to fetch category items' });
  }
});

// Update category order for a family
router.put('/categories/:familyId/order', authMiddleware, async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { categoryIds } = req.body;
  if (!Array.isArray(categoryIds)) return res.status(400).json({ error: 'categoryIds must be an array' });
  try {
    // Permission: only SystemAdmin or FamilyAdmin of the family may reorder
    if (req.user?.role !== 'SystemAdmin') {
      if (!(req.user?.familyId === familyId && req.user?.role === 'FamilyAdmin')) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    // Validate that supplied ids belong to the family
    const cats = await categoryRepo.findAll(familyId);
    const validIds = new Set(cats.map(c => c.id));
    for (const id of categoryIds) {
      if (!validIds.has(id)) return res.status(400).json({ error: `Invalid category id: ${id}` });
    }
    await updateCategoryPositions(familyId, categoryIds);
    return res.json({ message: 'Category order updated' });
  } catch (err) {
    console.error('Error updating category order:', err);
    return res.status(500).json({ error: 'Failed to update category order' });
  }
});

// Packing lists
// List packing lists for a family
router.get('/families/:familyId/packing-lists', authMiddleware, familyAccessMiddleware('familyId'), async (req: Request, res: Response) => {
  const { familyId } = req.params;
  try {
    const lists = await packingListRepo.findAll(familyId);
    // Attach member_ids for each list to keep responses lightweight
    const listsWithMembers = [] as any[];
    for (const l of lists) {
      const memberIds = await packingListRepo.getMemberIdsForPackingList(l.id);
      listsWithMembers.push({ ...l, member_ids: memberIds });
    }
    return res.json({ lists: listsWithMembers });
  } catch (error) {
    console.error('Error fetching packing lists:', error);
    return res.status(500).json({ error: 'Failed to fetch packing lists' });
  }
});

// Create a new packing list for a family (optionally populate from template)
router.post('/families/:familyId/packing-lists', authMiddleware, familyAccessMiddleware('familyId'), async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { name, templateId, includeTemplateAssignments = true, memberIds } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ error: 'Name is required' });
  try {
    const newList = await packingListRepo.create({ id: uuidv4(), family_id: familyId, name: name.trim(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    // Persist member selection: if not provided, default to all current family members
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      // fetch current family members
      const familyMembers = await userRepo.findByFamilyId(familyId);
      const ids = familyMembers.map(m => m.id);
      await packingListRepo.setMemberIdsForPackingList(newList.id, ids);
      newList.member_ids = ids;
    } else {
      await packingListRepo.setMemberIdsForPackingList(newList.id, memberIds);
      newList.member_ids = memberIds;
    }
    if (templateId) {
      // record assignment and reconcile immediately for newly created list
      await packingListRepo.setTemplatesForPackingList(newList.id, [templateId]);
      await packingListRepo.reconcilePackingListAgainstTemplate(newList.id, templateId);
    }
    return res.json({ list: newList });
  } catch (error) {
    console.error('Error creating packing list:', error);
    return res.status(500).json({ error: 'Failed to create packing list' });
  }
});

// Get detailed packing list with items and per-member checks
router.get('/packing-lists/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const list = await packingListRepo.findById(id);
    if (!list) return res.status(404).json({ error: 'Packing list not found' });
    // family access check
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== list.family_id) return res.status(403).json({ error: 'Forbidden' });
  // return enriched items with member assignments to reduce client chatter
  const items = await packingListRepo.getItemsWithMembers(id);
  const checks = await packingListRepo.getUserItemChecks(id);
  const notNeededRows = await packingListRepo.getNotNeededForList(id);
  // Remove any per-item `checked` column (it can be ambiguous) so the
  // canonical per-user checked state lives only in `checks`.
  const sanitizedItems = items.map(({ checked, ...rest }: any) => rest);
    // Intentionally not logging list contents to avoid noisy server logs in production
  // Also include any template assignments for this packing list so the UI can display them
  const templateIds = await packingListRepo.getTemplatesForPackingList(id);
  // Attach member_ids to the returned list for client consumption
  const memberIds = await packingListRepo.getMemberIdsForPackingList(id);
  (list as any).member_ids = memberIds;
  return res.json({ list, items: sanitizedItems, checks, not_needed_rows: notNeededRows, template_ids: templateIds });
  } catch (error) {
    console.error('Error fetching packing list:', error);
    return res.status(500).json({ error: 'Failed to fetch packing list' });
  }
});

// Populate an existing list from a template
router.post('/packing-lists/:id/populate-from-template', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { templateId } = req.body;
  if (!templateId) return res.status(400).json({ error: 'templateId is required' });
  try {
    const list = await packingListRepo.findById(id);
    if (!list) return res.status(404).json({ error: 'Packing list not found' });
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== list.family_id) return res.status(403).json({ error: 'Forbidden' });
    // persist assignment if not already assigned
    await packingListRepo.setTemplatesForPackingList(id, Array.from(new Set([...(await packingListRepo.getTemplatesForPackingList(id)), templateId])));
    await packingListRepo.reconcilePackingListAgainstTemplate(id, templateId);
    return res.json({ message: 'Populated from template and reconciled' });
  } catch (error) {
    console.error('Error populating packing list from template:', error);
    return res.status(500).json({ error: 'Failed to populate packing list' });
  }
});

// Update packing list (rename or other metadata)
router.put('/packing-lists/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const existing = await packingListRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Packing list not found' });
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== existing.family_id) return res.status(403).json({ error: 'Forbidden' });
    // If templateIds provided, persist assignments. Optionally remove associated items for removed templates.
    if (Array.isArray(updates.templateIds)) {
      const removeItemsFlag = !!updates.removeItemsForRemovedTemplates;
      console.log('[PUT /packing-lists/:id] Template update for list', id, '- templateIds:', updates.templateIds, 'removeItemsFlag:', removeItemsFlag);
      
      // Get previous template assignments to determine what changed
      const previousTemplateIds = await packingListRepo.getTemplatesForPackingList(id);
      await packingListRepo.setTemplatesForPackingList(id, updates.templateIds, removeItemsFlag);
      
      // Reconcile items for newly added templates (synchronously so UI gets updated items)
      const addedTemplates = updates.templateIds.filter((tid: string) => !previousTemplateIds.includes(tid));
      for (const tid of addedTemplates) {
        try {
          await packingListRepo.reconcilePackingListAgainstTemplate(id, tid);
        } catch (err) {
          console.error('Error reconciling newly assigned template', { listId: id, templateId: tid, err });
        }
      }
      
      // Enqueue background propagation for any other lists using these templates
      for (const tid of updates.templateIds) propagateTemplateToAssignedLists(tid);
      
      // remove template-related flags from updates passed to generic update
      delete updates.templateIds;
      delete updates.removeItemsForRemovedTemplates;
    }
    // Persist memberIds if provided
    if (Array.isArray(updates.memberIds)) {
      try {
        await packingListRepo.setMemberIdsForPackingList(id, updates.memberIds);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid memberIds for this packing list' });
      }
      // reflect member_ids on returned list
      delete updates.memberIds;
    }
    const updated = await packingListRepo.update(id, updates);
    return res.json({ list: updated });
  } catch (error) {
    console.error('Error updating packing list:', error);
    return res.status(500).json({ error: 'Failed to update packing list' });
  }
});

// Delete (soft-delete) packing list
router.delete('/packing-lists/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const existing = await packingListRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Packing list not found' });
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== existing.family_id) return res.status(403).json({ error: 'Forbidden' });
    await packingListRepo.softDelete(id);
    return res.json({ message: 'Packing list deleted' });
  } catch (error) {
    console.error('Error deleting packing list:', error);
    return res.status(500).json({ error: 'Failed to delete packing list' });
  }
});

// Client sync push endpoint
// Add items to a packing list (supports masterItemId or oneOff)
router.post('/packing-lists/:id/items', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { masterItemId, oneOff, memberIds } = req.body as any;
  try {
    const list = await packingListRepo.findById(id);
    if (!list) return res.status(404).json({ error: 'Packing list not found' });
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== list.family_id) return res.status(403).json({ error: 'Forbidden' });
    let created;
    if (masterItemId) {
      // If masterItemId is provided and member assignments are included, assign those members to the master item
      created = await packingListRepo.addItem(id, masterItemId, false);
      if (Array.isArray(memberIds) && memberIds.length > 0) {
        const itemRepo = new (require('./repositories').ItemRepository)();
        for (const m of memberIds) {
          await itemRepo.assignToMember(masterItemId, m);
        }
      }
    } else if (oneOff && oneOff.name) {
      try {
        // Accept optional memberIds to assign the newly created master one-off to members
        // Also accept optional categoryId to persist category on the master item
        const categoryId = (oneOff && (oneOff.categoryId || oneOff.category_id)) || undefined;
        const wholeFamily = (oneOff && (oneOff.wholeFamily || oneOff.whole_family)) || undefined;
        created = await packingListRepo.addOneOffItem(id, oneOff.name, true, Array.isArray(memberIds) ? memberIds : undefined, categoryId, wholeFamily);
      } catch (err: any) {
        // Surface DB constraint errors to the caller rather than attempting
        // an automatic runtime migration. Migrations should be run explicitly.
        console.error('Error adding one-off item to packing list (no runtime migration):', err);
        throw err;
      }
    } else {
      return res.status(400).json({ error: 'masterItemId or oneOff.name is required' });
    }
  try { broadcastEvent({ type: 'packing_list_changed', listId: id, data: { item: created, change: 'add_item' } }); } catch (e) {}
  return res.json({ item: created });
  } catch (error) {
    try {
      // Ensure we only access .stack when error is an instance of Error
      const errInfo = error instanceof Error ? (error.stack || error.message) : error;
      console.error('Error adding item to packing list:', { err: errInfo, body: req.body });
    } catch (logErr) {
      // Fallback logging if serialization itself throws
      try {
        console.error('Error adding item to packing list (failed to serialize):', String(error));
      } catch (e) {
        console.error('Error adding item to packing list (failed to serialize and stringify)');
      }
    }
    return res.status(500).json({ error: 'Failed to add item to packing list' });
  }
});

// Toggle/set per-user checked state
router.patch('/packing-lists/:listId/items/:itemId/check', authMiddleware, async (req: Request, res: Response) => {
  const { listId, itemId } = req.params;
  const { userId, checked } = req.body as any;
  try {
    const list = await packingListRepo.findById(listId);
    if (!list) return res.status(404).json({ error: 'Packing list not found' });
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== list.family_id) return res.status(403).json({ error: 'Forbidden' });
    if (process.env.NODE_ENV !== 'production') console.log('PATCH check request:', { listId, itemId, userId, checked, checkedType: typeof checked });
    if (process.env.NODE_ENV !== 'production') console.log('PATCH check for list:', { id: list.id, name: list.name });
    let pli = await packingListRepo.findItem(listId, itemId);
    // If not found by (packing_list_id, item_id) try interpreting itemId as the packing_list_item id
    if (!pli) {
      const maybe = await packingListRepo.findItemById(itemId);
      if (maybe && maybe.packing_list_id === listId) {
        pli = maybe;
      }
    }
    if (!pli) {
      console.log('List item not found for check', { listId, itemId });
      return res.status(404).json({ error: 'List item not found' });
    }
    // userId defaults to authenticated user. If the client explicitly provided
    // `userId: null` that indicates a whole-family check (member_id NULL).
    let memberId: string | null;
    // Preserve previous semantics: when the client omits `userId` default to
    // the authenticated user. If the client explicitly provides `null` it is
    // intended to indicate a whole-family check (member_id NULL) and should
    // be passed through. This prevents accidental interpretation of `null`
    // as the authenticated user which caused whole-family checks to be
    // converted into per-member checks.
    let memberIdRaw = userId;
    if (typeof memberIdRaw === 'undefined') memberId = req.user!.id;
    else memberId = memberIdRaw; // may be null to indicate whole-family

    // If the packing-list-item is marked as whole-family (DB may use snake_case
    // while JS code may use camelCase), canonicalize all check updates to the
    // NULL-member row so there is a single source of truth for whole-family
    // checked state. Ignore any provided per-member id.
    const pliWholeFamily = (pli as any).whole_family || (pli as any).wholeFamily || false;
    if (pliWholeFamily) {
      if (memberId !== null) console.log('Canonicalizing per-member check to whole-family for pli', pli.id, 'ignoring memberId', memberId);
      memberId = null;
    }
    if (process.env.NODE_ENV !== 'production') console.log('About to call setUserItemChecked with', { listName: list.name, packing_list_item_id: pli.id, memberId, checked, checkedType: typeof checked });
  await packingListRepo.setUserItemChecked(pli.id, memberId, !!checked);
  console.log('setUserItemChecked completed for', { listName: list.name, packing_list_item_id: pli.id, memberId });
  try { broadcastEvent({ type: 'packing_list_changed', listId, data: { itemId: pli.id, change: 'check', memberId, checked: !!checked } }); } catch (e) {}
    return res.json({ message: 'Check updated' });
  } catch (error) {
    console.error('Error updating check:', error);
    return res.status(500).json({ error: 'Failed to update check' });
  }
});

// Set not_needed flag on a packing list item
router.patch('/packing-lists/:listId/items/:itemId/not-needed', authMiddleware, async (req: Request, res: Response) => {
  const { listId, itemId } = req.params;
  const { notNeeded, memberId } = req.body as any;
  try {
    console.log('PATCH not-needed request received', { listId, itemId, notNeeded, user: req.user?.id });
    const list = await packingListRepo.findById(listId);
    if (!list) return res.status(404).json({ error: 'Packing list not found' });
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== list.family_id) return res.status(403).json({ error: 'Forbidden' });
    let pli = await packingListRepo.findItem(listId, itemId);
    if (!pli) {
      const maybe = await packingListRepo.findItemById(itemId);
      if (maybe && maybe.packing_list_id === listId) pli = maybe;
    }
    if (!pli) return res.status(404).json({ error: 'List item not found' });
  // If memberId is present, set per-member not-needed; otherwise, update legacy column as well for compatibility
  if (typeof memberId !== 'undefined' && memberId !== null) {
    await packingListRepo.setUserItemNotNeeded(pli.id, memberId, !!notNeeded);
    try { broadcastEvent({ type: 'packing_list_changed', listId, data: { itemId: pli.id, change: 'not_needed', notNeeded: !!notNeeded, memberId } }); } catch (e) {}
    return res.json({ message: 'not_needed updated (per-member)' });
  } else {
    const updated = await packingListRepo.setNotNeeded(pli.id, !!notNeeded);
    try { broadcastEvent({ type: 'packing_list_changed', listId, data: { itemId: pli.id, change: 'not_needed', notNeeded: !!notNeeded, updated } }); } catch (e) {}
    console.log('PATCH not-needed completed, returning updated row', { updated });
    return res.json({ message: 'not_needed updated', updated });
  }
  } catch (error) {
    console.error('Error updating not_needed:', error);
    return res.status(500).json({ error: 'Failed to update not_needed' });
  }
});

// Promote one-off to master
router.post('/packing-lists/:listId/items/:itemId/promote', authMiddleware, async (req: Request, res: Response) => {
  const { listId, itemId } = req.params;
  const { createTemplate, templateName } = req.body as any;
  try {
    const list = await packingListRepo.findById(listId);
    if (!list) return res.status(404).json({ error: 'Packing list not found' });
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== list.family_id) return res.status(403).json({ error: 'Forbidden' });
    let pli = await packingListRepo.findItem(listId, itemId);
    if (!pli) {
      const maybe = await packingListRepo.findItemById(itemId);
      if (maybe && maybe.packing_list_id === listId) pli = maybe;
    }
    if (!pli) return res.status(404).json({ error: 'List item not found' });
    const result = await packingListRepo.promoteOneOffToMaster(pli.id, list.family_id, !!createTemplate, templateName);
    return res.json({ promoted: result });
  } catch (error) {
    console.error('Error promoting one-off:', error);
    return res.status(500).json({ error: 'Failed to promote one-off' });
  }
});

// Delete a packing list item (does NOT delete the master item). Accepts either the packing_list_item id or the master item id.
router.delete('/packing-lists/:listId/items/:itemId', authMiddleware, async (req: Request, res: Response) => {
  const { listId, itemId } = req.params;
  try {
    const list = await packingListRepo.findById(listId);
    if (!list) return res.status(404).json({ error: 'Packing list not found' });
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== list.family_id) return res.status(403).json({ error: 'Forbidden' });

    // Try to find by (packing_list_id, item_id)
    let pli = await packingListRepo.findItem(listId, itemId);
    if (!pli) {
      // Maybe the caller provided the packing_list_items.id directly
      const maybe = await packingListRepo.findItemById(itemId);
      if (maybe && maybe.packing_list_id === listId) pli = maybe;
    }
    if (!pli) return res.status(404).json({ error: 'List item not found' });

    // Remove associated checks and the packing list row
  await packingListRepo.removeItemByPliId(pli.id, true); // broadcast: true for manual deletions
  return res.json({ message: 'Packing list item removed' });
  } catch (error) {
    console.error('Error deleting packing list item:', error);
    return res.status(500).json({ error: 'Failed to delete packing list item' });
  }
});

// Set active list for family
router.patch('/families/:familyId/active-packing-list', authMiddleware, familyAccessMiddleware('familyId'), async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { listId } = req.body as any;
  try {
    const list = await packingListRepo.findById(listId);
    if (!list || list.family_id !== familyId) return res.status(404).json({ error: 'Packing list not found for this family' });
    await familyRepo.update(familyId, { active_packing_list_id: listId });
    return res.json({ message: 'Active packing list updated' });
  } catch (error) {
    console.error('Error setting active packing list:', error);
    return res.status(500).json({ error: 'Failed to set active packing list' });
  }
});

router.put('/categories/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Category name is required' });
  }
  try {
    const updated = await categoryRepo.update(id, { name: name.trim() });
    // find templates referencing this category and propagate changes
    try {
      const templateIds = await templateRepo.getTemplatesReferencingCategory(id);
      for (const tid of templateIds) propagateTemplateToAssignedLists(tid);
    } catch (e) {
      console.error('Error enqueuing propagation after category update', e);
    }
    return res.json({ category: updated });
  } catch (error) {
    console.error('Error updating category:', error);
    return res.status(500).json({ error: 'Failed to update category' });
  }
});

// SSE endpoint - client may connect to receive server-sent events for list updates
router.get('/events', authMiddleware, (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  const clientId = addClient(res, req);
  req.on('close', () => {
    try { sseLog('[SSE] connection closed for client id=', clientId); } catch (e) {}
    removeClient(res);
  });
});

// Debug: return list of SSE clients and metadata (no auth required)
router.get('/debug/sse-clients', async (req: Request, res: Response) => {
  try {
    console.log('[DEBUG] Debug endpoint called');
    const clients = getClients();
    console.log('[DEBUG] getClients returned:', clients.length, 'clients');
    return res.json({ clients, count: clients.length });
  } catch (e) {
    console.error('[DEBUG] Error in debug endpoint:', e);
    const error = e as Error;
    console.error('[DEBUG] Error stack:', error.stack);
    return res.status(500).json({ error: 'Failed to fetch debug data', details: error.message });
  }
});

// Build info endpoint. Returns the contents of /app/build-info.json if present.
// This file is baked into the container image at build time by the Dockerfile and
// contains version, vcs_ref, and build_date. No auth required; used by the frontend
// to show the running version.
router.get('/build-info', async (req: Request, res: Response) => {
  try {
    const buildInfoPath = path.resolve(process.cwd(), 'build-info.json');
    if (fs.existsSync(buildInfoPath)) {
      const raw = fs.readFileSync(buildInfoPath, 'utf-8');
      const json = JSON.parse(raw);
      return res.json({ build: json });
    }
    return res.json({ build: { version: process.env.npm_package_version || 'dev', note: 'build-info not found' } });
  } catch (err) {
    console.error('Error reading build-info:', err);
    return res.status(500).json({ error: 'Failed to read build info' });
  }
});



router.delete('/categories/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await categoryRepo.softDelete(id);
    // propagate for templates referencing this category
    try {
      const templateIds = await templateRepo.getTemplatesReferencingCategory(id);
      for (const tid of templateIds) propagateTemplateToAssignedLists(tid);
    } catch (e) {
      console.error('Error enqueuing propagation after category delete', e);
    }
    return res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('Error deleting category:', error);
    return res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Item CRUD endpoints
router.post('/items', authMiddleware, async (req: Request, res: Response) => {
  const { familyId, name } = req.body;
  if (!familyId || !name || name.trim() === '') {
    return res.status(400).json({ error: 'Family ID and item name are required' });
  }
  try {
    const isOneOff = typeof req.body.isOneOff !== 'undefined' ? (!!req.body.isOneOff) : false;
    const item = await itemRepo.create({
      id: uuidv4(),
      familyId,
      name: name.trim(),
      isOneOff: isOneOff,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return res.json({ item });
  } catch (error) {
    console.error('Error creating item:', error);
    return res.status(500).json({ error: 'Failed to create item' });
  }
});

router.get('/items/:familyId', authMiddleware, familyAccessMiddleware('familyId'), async (req: Request, res: Response) => {
  const { familyId } = req.params;
  try {
    const items = await itemRepo.findAll(familyId);
    return res.json({ items });
  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({ error: 'Failed to fetch items' });
  }
});

router.put('/items/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, isOneOff } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Item name is required' });
  }
  try {
    const updates: any = { name: name.trim() };
    // Allow updating isOneOff flag (e.g., converting one-off to regular item)
    if (typeof isOneOff !== 'undefined') {
      updates.isOneOff = isOneOff ? 1 : 0;
    }
    const updated = await itemRepo.update(id, updates);
    // enqueue propagation for templates that reference this item
    try {
      const templateIds = await templateRepo.getTemplatesReferencingItem(id);
      for (const tid of templateIds) propagateTemplateToAssignedLists(tid);
    } catch (e) {
      console.error('Error enqueuing propagation after item update', e);
    }
    return res.json({ item: updated });
  } catch (error) {
    console.error('Error updating item:', error);
    return res.status(500).json({ error: 'Failed to update item' });
  }
});

router.delete('/items/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // Remove item from all packing lists (and associated checks) before soft-deleting
    try {
      await itemRepo.removeFromAllPackingLists(id);
    } catch (cleanErr) {
      console.warn('Failed to remove item from packing lists prior to delete:', cleanErr);
      // continue to soft-delete even if cleanup failed
    }
    await itemRepo.softDelete(id);
    // Also propagate for templates referencing this item so lists can reconcile
    try {
      const templateIds = await templateRepo.getTemplatesReferencingItem(id);
      for (const tid of templateIds) propagateTemplateToAssignedLists(tid);
    } catch (e) {
      console.error('Error enqueuing propagation after item delete', e);
    }
    return res.json({ message: 'Item deleted and removed from packing lists' });
  } catch (error) {
    console.error('Error deleting item:', error);
    return res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Assignment endpoints
router.post('/items/:itemId/categories/:categoryId', authMiddleware, async (req: Request, res: Response) => {
  const { itemId, categoryId } = req.params;
  try {
    await itemRepo.assignToCategory(itemId, categoryId);
    // templates referencing this category may now include this item; propagate those templates
    try {
      const templateIds = await templateRepo.getTemplatesReferencingCategory(categoryId);
      for (const tid of templateIds) propagateTemplateToAssignedLists(tid);
    } catch (e) {
      console.error('Error enqueuing propagation after item->category assign', e);
    }
    return res.json({ message: 'Item assigned to category' });
  } catch (error) {
    console.error('Error assigning item to category:', error);
    return res.status(500).json({ error: 'Failed to assign item to category' });
  }
});

router.delete('/items/:itemId/categories/:categoryId', authMiddleware, async (req: Request, res: Response) => {
  const { itemId, categoryId } = req.params;
  try {
    await itemRepo.removeFromCategory(itemId, categoryId);
    // templates referencing this category may now exclude this item; propagate those templates
    try {
      const templateIds = await templateRepo.getTemplatesReferencingCategory(categoryId);
      for (const tid of templateIds) propagateTemplateToAssignedLists(tid);
    } catch (e) {
      console.error('Error enqueuing propagation after item->category remove', e);
    }
    return res.json({ message: 'Item removed from category' });
  } catch (error) {
    console.error('Error removing item from category:', error);
    return res.status(500).json({ error: 'Failed to remove item from category' });
  }
});

router.post('/items/:itemId/members/:memberId', authMiddleware, async (req: Request, res: Response) => {
  const { itemId, memberId } = req.params;
  try {
    await itemRepo.assignToMember(itemId, memberId);
    // Broadcast to any packing lists that include this item via templates so clients update
    try {
      // Gather templates that reference this item directly
      const directTemplateIds = await templateRepo.getTemplatesReferencingItem(itemId);
      // Also include templates that reference any category the item belongs to
      const categories = await itemRepo.getCategoriesForItem(itemId);
      const categoryIds = (categories || []).map((c: any) => c.id);
      const categoryTemplateIdsSet = new Set<string>();
      for (const cid of categoryIds) {
        const tids = await templateRepo.getTemplatesReferencingCategory(cid);
        for (const t of tids) categoryTemplateIdsSet.add(t);
      }
      const allTemplateIdsSet = new Set<string>([...directTemplateIds, ...Array.from(categoryTemplateIdsSet)]);
      const templateIds = Array.from(allTemplateIdsSet);
      console.log('[SSE] member assignment changed for item', itemId, 'member', memberId, 'directTemplates=', directTemplateIds.length ? directTemplateIds : 'none', 'categoryTemplates=', Array.from(categoryTemplateIdsSet));
      for (const tid of templateIds) {
        const lists = await packingListRepo.getPackingListsForTemplate(tid);
        console.log('[SSE] template', tid, 'affects lists:', lists.map((x: any) => x.id));
        for (const l of lists) {
          const payload = { type: 'packing_list_changed', listId: l.id, data: { itemId, memberId, change: 'member_assignment', action: 'assigned' } };
          try {
            console.log('[SSE] broadcasting member assignment payload to list', l.id, payload);
            broadcastEvent(payload);
          } catch (e) {
            console.error('[SSE] failed to broadcast member assignment payload', { listId: l.id, itemId, memberId, err: e });
          }
        }
      }
    } catch (e) {
      console.error('Error broadcasting member assignment updates for item', itemId, e);
    }
    return res.json({ message: 'Item assigned to member' });
  } catch (error) {
    console.error('Error assigning item to member:', error);
    return res.status(500).json({ error: 'Failed to assign item to member' });
  }
});

router.delete('/items/:itemId/members/:memberId', authMiddleware, async (req: Request, res: Response) => {
  const { itemId, memberId } = req.params;
  try {
    await itemRepo.removeFromMember(itemId, memberId);
    // Broadcast to any packing lists that include this item via templates so clients update
    try {
      // Gather templates that reference this item directly
      const directTemplateIds = await templateRepo.getTemplatesReferencingItem(itemId);
      // Also include templates that reference any category the item belongs to
      const categories = await itemRepo.getCategoriesForItem(itemId);
      const categoryIds = (categories || []).map((c: any) => c.id);
      const categoryTemplateIdsSet = new Set<string>();
      for (const cid of categoryIds) {
        const tids = await templateRepo.getTemplatesReferencingCategory(cid);
        for (const t of tids) categoryTemplateIdsSet.add(t);
      }
      const allTemplateIdsSet = new Set<string>([...directTemplateIds, ...Array.from(categoryTemplateIdsSet)]);
      const templateIds = Array.from(allTemplateIdsSet);
      console.log('[SSE] member removal for item', itemId, 'member', memberId, 'directTemplates=', directTemplateIds.length ? directTemplateIds : 'none', 'categoryTemplates=', Array.from(categoryTemplateIdsSet));
      for (const tid of templateIds) {
        const lists = await packingListRepo.getPackingListsForTemplate(tid);
        console.log('[SSE] template', tid, 'affects lists:', lists.map((x: any) => x.id));
        for (const l of lists) {
          const payload = { type: 'packing_list_changed', listId: l.id, data: { itemId, memberId, change: 'member_assignment', action: 'removed' } };
          try {
            console.log('[SSE] broadcasting member removal payload to list', l.id, payload);
            broadcastEvent(payload);
          } catch (e) {
            console.error('[SSE] failed to broadcast member removal payload', { listId: l.id, itemId, memberId, err: e });
          }
        }
      }
    } catch (e) {
      console.error('Error broadcasting member removal updates for item', itemId, e);
    }
    return res.json({ message: 'Item removed from member' });
  } catch (error) {
    console.error('Error removing item from member:', error);
    return res.status(500).json({ error: 'Failed to remove item from member' });
  }
});

// Get members assigned to an item
router.get('/items/:itemId/members', authMiddleware, async (req: Request, res: Response) => {
  const { itemId } = req.params;
  try {
    const members = await itemRepo.getMembersForItem(itemId);
    return res.json({ members });
  } catch (error) {
    console.error('Error fetching members for item:', error);
    return res.status(500).json({ error: 'Failed to fetch members for item' });
  }
});

router.post('/items/:itemId/whole-family/:familyId', authMiddleware, familyAccessMiddleware('familyId'), async (req: Request, res: Response) => {
  const { itemId, familyId } = req.params;
  try {
    await itemRepo.assignToWholeFamily(itemId, familyId);
    return res.json({ message: 'Item assigned to whole family' });
  } catch (error) {
    console.error('Error assigning item to whole family:', error);
    return res.status(500).json({ error: 'Failed to assign item to whole family' });
  }
});

router.delete('/items/:itemId/whole-family', authMiddleware, async (req: Request, res: Response) => {
  const { itemId } = req.params;
  try {
    await itemRepo.removeFromWholeFamily(itemId);
    return res.json({ message: 'Item removed from whole family' });
  } catch (error) {
    console.error('Error removing item from whole family:', error);
    return res.status(500).json({ error: 'Failed to remove item from whole family' });
  }
});

  // Get items assigned to whole family for a packing list
  router.get('/items/:itemId/whole-family', authMiddleware, async (req: Request, res: Response) => {
    const { itemId } = req.params;
    try {
      // Assuming itemRepo.getWholeFamilyAssignment returns the item if assigned to whole family, or null/empty otherwise
      const assignment = await itemRepo.getWholeFamilyAssignment(itemId);
      if (!assignment) {
        return res.status(404).json({ error: 'No whole family assignment found for this item' });
      }
      return res.json({ item: assignment });
    } catch (error) {
      console.error('Error fetching whole family assignment:', error);
      return res.status(500).json({ error: 'Failed to fetch whole family assignment' });
    }
  });

// Create default admin if not exists
export async function ensureDefaultAdmin() {
  const admin = await userRepo.findByUsername('administrator');
  if (!admin) {
    try {
      await userRepo.create({
        id: uuidv4(),
        username: 'administrator',
        password: hashPasswordSync('adminChangeMe1!'),
        role: 'SystemAdmin',
        must_change_password: true,
        email: '',
        familyId: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch (err: any) {
      // Ignore duplicate admin creation error
      if (err.code !== 'SQLITE_CONSTRAINT') throw err;
    }
  }
}
// Delay ensuring the default admin until the next event loop turn to avoid
// races with test-time DB initialization when this module is imported.
// Delay ensuring the default admin until the next event loop turn to avoid
// races with test-time DB initialization when this module is imported.
// However, when running tests (vitest or NODE_ENV=test) avoid touching the DB
// during import altogether — tests initialize the DB explicitly.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const isTestEnv = process.env.NODE_ENV === 'test' || (typeof global !== 'undefined' && (global as any).VITEST) || process.env.VITEST;
if (!isTestEnv) {
  setImmediate(() => {
    ensureDefaultAdmin().catch(err => {
      // Log but don't crash module import
      console.error('ensureDefaultAdmin failed:', err);
    });
  });

  // Single endpoint to fetch all data needed to edit an item in the UI.
  // Returns family categories, categories assigned to the item, family members,
  // members assigned to the item, and whether the item is assigned to whole family.
  router.get('/items/:itemId/edit-data', authMiddleware, async (req: Request, res: Response) => {
    const { itemId } = req.params;
    // Optional familyId can be provided via query (used when impersonating)
    const familyId = req.query.familyId as string | undefined;
    try {
      // Determine familyId: prefer provided familyId, otherwise try to read from item or user profile
      let fid = familyId;
      if (!fid && req.user && req.user.familyId) fid = req.user.familyId;

      const [item, categories, itemCategories, members, itemMembers, wholeAssigned] = await Promise.all([
        itemRepo.findById(itemId),
        fid ? categoryRepo.findAll(fid) : Promise.resolve([]),
        itemRepo.getCategoriesForItem(itemId),
        fid ? userRepo.findByFamilyId(fid) : Promise.resolve([]),
        itemRepo.getMembersForItem(itemId),
        itemRepo.isAssignedToWholeFamily(itemId),
      ]);

      // Compute memberIds and wholeFamily for compatibility with category item list
      let memberIds: string[] = [];
      if (!wholeAssigned) {
        // Only fetch member assignments if not assigned to whole family
        memberIds = Array.isArray(itemMembers) ? itemMembers.map((m: any) => m.id) : [];
      }
      const wholeFamily = !!wholeAssigned;

      return res.json({ item, categories, itemCategories, members, itemMembers, wholeAssigned, memberIds, wholeFamily });
    } catch (error) {
      console.error('Error fetching edit-data for item:', error);
      return res.status(500).json({ error: 'Failed to fetch item edit data' });
    }
  });
} else {
  // In test environment, do not auto-create admin here to avoid races.
  // Tests that need a default admin should call ensureDefaultAdmin() explicitly
  // after the test DB has been initialized.
}

// Login endpoint
router.post('/login', async (req: Request, res: Response): Promise<Response> => {
  const { username, password } = req.body;
  const user = await userRepo.findByUsername(username);
  if (!user || !user.password_hash || !comparePasswordSync(password, user.password_hash)) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: ERROR_CODES.INVALID_CREDENTIALS 
    });
  }
  if (user.must_change_password) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({ 
      error: ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
      username: user.username || ''
    });
  }
  const token = generateToken(user);
  await logAudit({
    userId: user.id,
    username: user.username || '',
    action: 'login',
    details: 'User logged in successfully'
  });
  return res.json({ token, role: user.role });
});

// Logout endpoint (client-side: just delete token)
router.post('/logout', (req: Request, res: Response): Response => {
  return res.json({ message: 'Logged out' });
});

// Change password endpoint
router.post('/change-password', async (req: Request, res: Response): Promise<Response> => {
  const { username, oldPassword, newPassword } = req.body;
  const user = await userRepo.findByUsername(username);
  if (!user || !user.password_hash || !comparePasswordSync(oldPassword, user.password_hash)) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: ERROR_CODES.INVALID_CREDENTIALS 
    });
  }
  if (!validatePassword(newPassword)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
      error: ERROR_CODES.PASSWORD_TOO_WEAK 
    });
  }
  await userRepo.update(user.id, {
    password_hash: await hashPassword(newPassword),
    must_change_password: false
  });
  await logAudit({
    userId: user.id,
    username: user.username || '',
    action: 'change-password',
    details: 'User changed password'
  });
  return res.json({ message: 'Password changed successfully' });
});

// Create family member (SystemAdmin or FamilyAdmin for same family)
router.post('/families/:familyId/members', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  // Allow SystemAdmin or a FamilyAdmin who belongs to the target family
  const { familyId } = req.params;
  if (req.user?.role !== 'SystemAdmin') {
    if (!(req.user?.role === 'FamilyAdmin' && req.user?.familyId === familyId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  const { name, canLogin, username, password, role } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Member name is required' });
  }
  
  // Validate family exists
  const family = await familyRepo.findById(familyId);
  if (!family) {
    return res.status(404).json({ error: 'Family not found' });
  }
  
  // If canLogin is true, validate username and password
  if (canLogin) {
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required for login-enabled members' });
    }
    if (!password || !validatePassword(password)) {
      return res.status(400).json({ error: 'Password does not meet requirements' });
    }
    
    // Check if username already exists
    const existingUser = await userRepo.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
  }
  
  try {
    const memberData: any = {
      id: uuidv4(),
      name: name.trim(),
      familyId,
      role: canLogin ? (role || 'FamilyMember') : 'FamilyMember',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    if (canLogin && username && password) {
      memberData.username = username.trim();
      memberData.password_hash = await hashPassword(password);
      memberData.must_change_password = false;
    }
    
    const newMember = await userRepo.create(memberData);
    
    return res.json({ member: newMember });
  } catch (error) {
    console.error('Error creating family member:', error);
    return res.status(500).json({ error: 'Failed to create family member' });
  }
});

// Update family member order (SystemAdmin or FamilyAdmin for the family) - MUST come before :memberId route
router.put('/families/:familyId/members/order', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  // Allow SystemAdmin, or FamilyAdmin of the target family
  console.log('🔄 Member order endpoint hit - familyId:', req.params.familyId);
  console.log('🔄 Request body:', JSON.stringify(req.body));
  console.log('🔄 User role:', req.user?.role, 'User familyId:', req.user?.familyId);
  
  const { familyId } = req.params;
  if (req.user?.role !== 'SystemAdmin') {
    if (!(req.user?.familyId === familyId && req.user?.role === 'FamilyAdmin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  const { memberIds } = req.body;
  if (!Array.isArray(memberIds)) {
    return res.status(400).json({ error: 'memberIds must be an array' });
  }
  try {
    // Validate family exists
    const family = await familyRepo.findById(familyId);
    if (!family) return res.status(404).json({ error: 'Family not found' });

    // Fetch current members for the family
    const currentMembers = await userRepo.findByFamilyId(familyId);
    const currentIds = new Set(currentMembers.map(m => m.id));

    // Ensure supplied ids are a permutation/subset of current members
    for (const id of memberIds) {
      if (!currentIds.has(id)) {
        return res.status(400).json({ error: `Invalid member id: ${id}` });
      }
    }

    // Update positions in a transaction-like loop
    console.log('🔄 About to update positions for memberIds:', memberIds);
    const db = await (await import('./db')).getDb();
    try {
      console.log('🔄 Starting transaction');
      await db.run('BEGIN TRANSACTION');
      for (let idx = 0; idx < memberIds.length; idx++) {
        const id = memberIds[idx];
        // position lower means earlier/left-most
        console.log(`🔄 Updating member ${id} to position ${idx}`);
        const result = await db.run(`UPDATE users SET position = ?, updated_at = ? WHERE id = ?`, [idx, new Date().toISOString(), id]);
        console.log(`🔄 Update result for ${id}:`, result);
      }
      console.log('🔄 Committing transaction');
      await db.run('COMMIT');
      console.log('✅ Transaction committed successfully');
    } catch (e) {
      console.error('❌ Transaction error:', e);
      try { 
        console.log('🔄 Rolling back transaction');
        await db.run('ROLLBACK'); 
      } catch (er) {
        console.error('❌ Rollback error:', er);
      }
      throw e;
    }

    // Debug: Check what the repository returns after update
    console.log('🔍 Checking members order after update...');
    const updatedMembers = await userRepo.findByFamilyId(familyId);
    console.log('🔍 Updated members from DB:', updatedMembers.map(m => ({ id: m.id, name: m.name, username: m.username, position: m.position })));

    return res.json({ message: 'Member order updated' });
  } catch (error) {
    console.error('❌ Error updating member order:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return res.status(500).json({ error: 'Failed to update member order' });
  }
});

// Edit family member (SystemAdmin only)
router.put('/families/:familyId/members/:memberId', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  // Allow SystemAdmin, or FamilyAdmin who belongs to the same family
  const { familyId, memberId } = req.params;
  if (req.user?.role !== 'SystemAdmin') {
    if (!(req.user?.role === 'FamilyAdmin' && req.user?.familyId === familyId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  const { name, username, role } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Member name is required' });
  }
  try {
    const updated = await userRepo.update(memberId, {
      name: name.trim(),
      username: username || null,
      role: role || 'FamilyMember',
      updated_at: new Date().toISOString(),
    });
    return res.json({ member: updated });
  } catch (error) {
    console.error('Error updating family member:', error);
    return res.status(500).json({ error: 'Failed to update family member' });
  }
});


// Reset password for family member (SystemAdmin only)
router.post('/families/:familyId/members/:memberId/reset-password', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  // Allow SystemAdmin, or FamilyAdmin who belongs to the same family
  const { familyId, memberId } = req.params;
  if (req.user?.role !== 'SystemAdmin') {
    if (!(req.user?.role === 'FamilyAdmin' && req.user?.familyId === familyId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  const { newPassword, requireChangeOnLogin } = req.body;
  if (!newPassword || !validatePassword(newPassword)) {
    return res.status(400).json({ error: 'Password does not meet requirements' });
  }
  try {
    const newHash = await hashPassword(newPassword);
    const updated = await userRepo.update(memberId, {
      password_hash: newHash,
      must_change_password: typeof requireChangeOnLogin === 'undefined' ? true : !!requireChangeOnLogin,
      updated_at: new Date().toISOString(),
    });
    return res.json({ member: updated });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Password reset endpoint (admin or user recovery)
router.post('/reset-password', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  const { username, newPassword } = req.body;
  // Only SystemAdmin or FamilyAdmin can reset passwords for other users
  // If not authenticated as admin, only allow self-reset (e.g., via recovery flow)
  // For now, assume admin-only for simplicity
  if (!req.user || (req.user.role !== 'SystemAdmin' && req.user.role !== 'FamilyAdmin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const user = await userRepo.findByUsername(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!validatePassword(newPassword)) {
    return res.status(400).json({ error: 'Password does not meet policy' });
  }
  await userRepo.update(user.id, {
    password_hash: await hashPassword(newPassword),
    must_change_password: false
  });
  await logAudit({
    userId: user.id,
    username: user.username || '',
    action: 'reset-password',
    details: `Password reset by ${req.user?.username || ''}`
  });
  return res.json({ message: 'Password reset successfully' });
});

// Get all users (SystemAdmin only)
router.get('/users', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const users = await userRepo.findAll();
  return res.json({ users });
});

// Get current user profile
router.get('/users/me', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  try {
    const user = await userRepo.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get family information and members if user is assigned to one
    let family = null;
    let members = [];
    if (user.familyId) {
      family = await familyRepo.findById(user.familyId);
      if (family) {
        // Get all users in this family (using findByFamilyId for proper position ordering)
        members = await userRepo.findByFamilyId(user.familyId);
        // Remove sensitive info from each member
        members = members.map(({ password_hash, ...rest }) => rest);
        family = { ...family, members };
      }
    }
    // Remove sensitive information from response
    const { password_hash, ...safeUser } = user;
    return res.json({ 
      user: safeUser,
      family: family 
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    return res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Add user (SystemAdmin only)
router.post('/users', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  const { username, password, role, email, familyId } = req.body;
  // Only SystemAdmin can add SystemAdmin users
  if (role === 'SystemAdmin' && req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password does not meet policy' });
  }
  const existing = await userRepo.findByUsername(username);
  if (existing) {
    return res.status(409).json({ error: 'User already exists' });
  }
  const user = await userRepo.create({
    id: uuidv4(),
    username,
    password: await hashPassword(password),
    role,
    must_change_password: false,
    email,
    familyId: familyId || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  return res.json({ user });
});

// Delete user (SystemAdmin only)
router.delete('/users/:id', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { id } = req.params;
  try {
    const db = await (await import('./db')).getDb();
    // Check dependent joins that would be affected by deleting this user
    const itemMembersRow: any = await db.get(`SELECT COUNT(1) as cnt FROM item_members WHERE member_id = ?`, [id]);
    const packingListMembersRow: any = await db.get(`SELECT COUNT(1) as cnt FROM packing_list_members WHERE member_id = ?`, [id]);
    const checksRow: any = await db.get(`SELECT COUNT(1) as cnt FROM packing_list_item_checks WHERE member_id = ?`, [id]);
    const deps = [] as string[];
    if ((itemMembersRow && (itemMembersRow.cnt || itemMembersRow['COUNT(1)'] || 0) > 0)) deps.push('item assignments');
    if ((packingListMembersRow && (packingListMembersRow.cnt || packingListMembersRow['COUNT(1)'] || 0) > 0)) deps.push('packing list memberships');
    if ((checksRow && (checksRow.cnt || checksRow['COUNT(1)'] || 0) > 0)) deps.push('item check records');
    if (deps.length > 0) {
      return res.status(409).json({ error: 'User has dependent data', message: `User cannot be deleted because of related: ${deps.join(', ')}.` });
    }
    await userRepo.softDelete(id);
    return res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get all families (SystemAdmin only)
router.get('/families', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const families = await familyRepo.findAll();
  return res.json({ families });
});

// Get family by id
router.get('/families/:id', authMiddleware, familyAccessMiddleware('id'), async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  try {
    const family = await familyRepo.findById(id);
    if (!family) return res.status(404).json({ error: 'Family not found' });
    // Include members for convenience (users in this family, with proper position ordering)
    const members = await userRepo.findByFamilyId(id);
    const safeMembers = members.map(({ password_hash, ...rest }) => rest);
    return res.json({ family: { ...family, members: safeMembers } });
  } catch (error) {
    console.error('Error fetching family:', error);
    return res.status(500).json({ error: 'Failed to fetch family' });
  }
});

// Add family (SystemAdmin only)
router.post('/families', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Family name is required' });
  }

  try {
    // Create new family record (do not assign any users/members)
    const familyId = uuidv4();
    const family = await familyRepo.create({
      id: familyId,
      name: name.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Seed example templates synchronously for the newly-created family
    try {
      await seedTemplatesForFamily(familyId);
    } catch (err) {
      console.error('Error seeding templates for new family:', err);
      // proceed even if seeding fails
    }

    // Return created family and seeded templates for convenience
    const templates = await templateRepo.findAll(familyId);
    return res.json({ family, templates, created: true });
  } catch (error) {
    console.error('Error creating family:', error);
    return res.status(500).json({ error: 'Failed to create family' });
  }
});

// Delete family (SystemAdmin only)
router.delete('/families/:id', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { id } = req.params;
  await familyRepo.softDelete(id);
  return res.json({ message: 'Family deleted successfully' });
});

export default router;
