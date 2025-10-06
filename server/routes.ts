// Get whole family assignment for an item
// Get categories for an item


import express, { Request, Response, Router } from 'express';
import { logAudit } from './audit';
import { validatePassword, hashPassword, comparePassword, hashPasswordSync, comparePasswordSync, generateToken } from './auth';
import { authMiddleware, familyAccessMiddleware } from './middleware';
import { UserRepository, FamilyRepository, CategoryRepository, ItemRepository } from './repositories';
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
    return res.json({ items });
  } catch (error) {
    console.error('Error fetching category items:', error);
    return res.status(500).json({ error: 'Failed to fetch category items' });
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
    return res.json({ category: updated });
  } catch (error) {
    console.error('Error updating category:', error);
    return res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await categoryRepo.softDelete(id);
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
    const item = await itemRepo.create({
      id: uuidv4(),
      familyId,
      name: name.trim(),
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
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Item name is required' });
  }
  try {
    const updated = await itemRepo.update(id, { name: name.trim() });
    return res.json({ item: updated });
  } catch (error) {
    console.error('Error updating item:', error);
    return res.status(500).json({ error: 'Failed to update item' });
  }
});

router.delete('/items/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await itemRepo.softDelete(id);
    return res.json({ message: 'Item deleted' });
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
    return res.json({ message: 'Item removed from member' });
  } catch (error) {
    console.error('Error removing item from member:', error);
    return res.status(500).json({ error: 'Failed to remove item from member' });
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

// Create family member (SystemAdmin only)
router.post('/families/:familyId/members', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { familyId } = req.params;
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

// Edit family member (SystemAdmin only)
router.put('/families/:familyId/members/:memberId', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { familyId, memberId } = req.params;
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
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { memberId } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || !validatePassword(newPassword)) {
    return res.status(400).json({ error: 'Password does not meet requirements' });
  }
  try {
    const newHash = await hashPassword(newPassword);
    const updated = await userRepo.update(memberId, {
      password_hash: newHash,
      must_change_password: true,
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
        // Get all users in this family
        members = await userRepo.findAll();
        members = members.filter(u => u.familyId === user.familyId && !u.deleted_at);
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
  await userRepo.softDelete(id);
  return res.json({ message: 'User deleted successfully' });
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
    // Include members for convenience (users in this family)
    const allUsers = await userRepo.findAll();
    const members = allUsers.filter(u => u.familyId === id && !u.deleted_at).map(({ password_hash, ...rest }) => rest);
    return res.json({ family: { ...family, members } });
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
