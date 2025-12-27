import { getDb } from './db';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';
// If a packing_list_item.created_at is within this threshold of its provenance created_at
// treat it as template-generated (not manually added). This tolerates tiny timing skew
// from separate INSERT statements executed in quick succession.
const MANUAL_ADDED_THRESHOLD_MS = 100; // 100ms
import { broadcastEvent } from './sse';
import { User, Family, Category, Item, ItemCategory, ItemMember, ItemWholeFamily } from './server-types';

interface CreateUserData extends Omit<User, 'password_hash'> {
  password: string;
}

// Add validation interfaces
interface UserFilters {
  familyId?: string;
  role?: string;
  includeDeleted?: boolean;
}

interface FamilyFilters {
  includeDeleted?: boolean;
}

export class UserRepository {
  async create(user: Partial<User> & { password?: string }): Promise<User> {
    const db = await getDb();
    // Accept family members with only a name, or with login credentials
    await db.run(
      `INSERT INTO users (id, name, username, password_hash, role, must_change_password, email, familyId, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name || user.username || 'Unnamed User',
        user.username || null,
  // Accept either a pre-hashed password passed in 'password_hash' or a value in 'password'
  user.password_hash || user.password || null,
        user.role || null,
        user.must_change_password ? 1 : 0,
        user.email || null,
        user.familyId || null,
        user.created_at,
        user.updated_at,
        null
      ]
    );
  const createdUser = await this.findById(user.id ?? '');
    if (!createdUser) {
      throw new Error('Failed to create user');
    }
    return createdUser;
  }

  async findByUsername(username: string): Promise<User | undefined> {
    const db = await getDb();
    return db.get(`SELECT * FROM users WHERE username = ? AND deleted_at IS NULL`, [username]);
  }

  async update(id: string, updates: Partial<User>): Promise<User | undefined> {
    const db = await getDb();
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    await db.run(`UPDATE users SET ${fields}, updated_at = ? WHERE id = ?`, [...values, new Date().toISOString(), id]);
    return this.findById(id);
  }

  async findById(id: string): Promise<User | undefined> {
    const db = await getDb();
    return db.get(`SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`, [id]);
  }

  async findAll(): Promise<User[]> {
    const db = await getDb();
    return db.all(`SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`);
  }

  async findByFamilyId(familyId: string): Promise<User[]> {
    const db = await getDb();
    // Order by explicit position if present, otherwise fall back to created_at
    return db.all(`SELECT * FROM users WHERE familyId = ? AND deleted_at IS NULL ORDER BY COALESCE(position, 2147483647) ASC, created_at ASC`, [familyId]);
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`UPDATE users SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
  }
}

export class FamilyRepository {
  async create(family: Family): Promise<Family> {
    const db = await getDb();
    await db.run(
      `INSERT INTO families (id, name, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?)`,
      [family.id, family.name, family.created_at, family.updated_at, null]
    );
    return this.findById(family.id) as Promise<Family>;
  }

  async findById(id: string): Promise<Family | undefined> {
    const db = await getDb();
    return db.get(`SELECT * FROM families WHERE id = ? AND deleted_at IS NULL`, [id]);
  }

  async update(id: string, updates: Partial<Family>): Promise<Family | undefined> {
    const db = await getDb();
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    await db.run(`UPDATE families SET ${fields}, updated_at = ? WHERE id = ?`, [...values, new Date().toISOString(), id]);
    return this.findById(id);
  }

  async findAll(): Promise<Family[]> {
    const db = await getDb();
    return db.all(`SELECT * FROM families WHERE deleted_at IS NULL ORDER BY created_at DESC`);
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`UPDATE families SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
  }
}

export class CategoryRepository {
  async create(category: Category): Promise<Category> {
    const db = await getDb();
    await db.run(
      `INSERT INTO categories (id, familyId, name, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [category.id, category.familyId, category.name, category.created_at, category.updated_at, null]
    );
    return this.findById(category.id) as Promise<Category>;
  }

  async findById(id: string): Promise<Category | undefined> {
    const db = await getDb();
    return db.get(`SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL`, [id]);
  }

  async update(id: string, updates: Partial<Category>): Promise<Category | undefined> {
    const db = await getDb();
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    await db.run(`UPDATE categories SET ${fields}, updated_at = ? WHERE id = ?`, [...values, new Date().toISOString(), id]);
    return this.findById(id);
  }

  async findAll(familyId: string): Promise<Category[]> {
    const db = await getDb();
    // Order by explicit position if present, otherwise fall back to created_at
    return db.all(`SELECT * FROM categories WHERE familyId = ? AND deleted_at IS NULL ORDER BY COALESCE(position, 2147483647) ASC, created_at ASC`, [familyId]);
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`UPDATE categories SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
  }
}

// Add helper to update category positions in a batch
export async function updateCategoryPositions(familyId: string, orderedCategoryIds: string[]): Promise<void> {
  const db = await getDb();
  try {
    await db.run('BEGIN TRANSACTION');
    for (let idx = 0; idx < orderedCategoryIds.length; idx++) {
      const id = orderedCategoryIds[idx];
      await db.run(`UPDATE categories SET position = ?, updated_at = ? WHERE id = ? AND familyId = ?`, [idx, new Date().toISOString(), id, familyId]);
    }
    await db.run('COMMIT');
  } catch (err) {
    try { await db.run('ROLLBACK'); } catch (e) {}
    throw err;
  }
}

export class ItemRepository {
  async setChecked(id: string, checked: boolean): Promise<Item | undefined> {
    const db = await getDb();
    await db.run(`UPDATE items SET checked = ?, updated_at = ? WHERE id = ?`, [checked ? 1 : 0, new Date().toISOString(), id]);
    return this.findById(id);
  }
  async create(item: Item): Promise<Item> {
    const db = await getDb();
    await db.run(
      `INSERT INTO items (id, familyId, name, isOneOff, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.familyId, item.name, item.isOneOff ? 1 : 0, item.created_at, item.updated_at, null]
    );
    return this.findById(item.id) as Promise<Item>;
  }

  async findById(id: string): Promise<Item | undefined> {
    const db = await getDb();
    return db.get(`SELECT * FROM items WHERE id = ? AND deleted_at IS NULL`, [id]);
  }

  async update(id: string, updates: Partial<Item>): Promise<Item | undefined> {
    const db = await getDb();
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    await db.run(`UPDATE items SET ${fields}, updated_at = ? WHERE id = ?`, [...values, new Date().toISOString(), id]);
    return this.findById(id);
  }

  async findAll(familyId: string): Promise<Item[]> {
    const db = await getDb();
    // By default exclude one-off items from master lists
    return db.all(`SELECT * FROM items WHERE familyId = ? AND (isOneOff IS NULL OR isOneOff = 0) AND deleted_at IS NULL ORDER BY created_at DESC`, [familyId]);
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`UPDATE items SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
  }

  // Remove references to an item from all packing lists (and related checks)
  async removeFromAllPackingLists(item_id: string): Promise<void> {
    const db = await getDb();
    try {
      await db.run('BEGIN TRANSACTION');
      // Find packing list rows referencing this item
      const rows: any[] = await db.all(`SELECT id FROM packing_list_items WHERE item_id = ?`, [item_id]);
      const ids = rows.map(r => r.id).filter(Boolean);
      if (ids.length > 0) {
        // Delete related checks
        const placeholders = ids.map(() => '?').join(',');
        await db.run(`DELETE FROM packing_list_item_checks WHERE packing_list_item_id IN (${placeholders})`, ids);
        // Delete any per-item not-needed rows to satisfy foreign keys
        await db.run(`DELETE FROM packing_list_item_not_needed WHERE packing_list_item_id IN (${placeholders})`, ids);
        // Delete provenance rows that reference these packing-list items to satisfy foreign keys
        await db.run(`DELETE FROM packing_list_item_templates WHERE packing_list_item_id IN (${placeholders})`, ids);
        // Delete packing list items
        await db.run(`DELETE FROM packing_list_items WHERE id IN (${placeholders})`, ids);
      }
      await db.run('COMMIT');
    } catch (err) {
      try { await db.run('ROLLBACK'); } catch (e) {}
      throw err;
    }
  }

  // Assignment methods
  async assignToCategory(item_id: string, category_id: string): Promise<void> {
    const db = await getDb();
    // Use single-category column on items as the canonical assignment
    await db.run(`UPDATE items SET categoryId = ?, updated_at = ? WHERE id = ?`, [category_id, new Date().toISOString(), item_id]);
  }

  async removeFromCategory(item_id: string, category_id: string): Promise<void> {
    const db = await getDb();
    // If the item's categoryId matches the category being removed, clear it.
    await db.run(`UPDATE items SET categoryId = NULL, updated_at = ? WHERE id = ? AND categoryId = ?`, [new Date().toISOString(), item_id, category_id]);
  }

  async assignToMember(item_id: string, member_id: string): Promise<void> {
    const db = await getDb();
    await db.run(`INSERT OR IGNORE INTO item_members (item_id, member_id) VALUES (?, ?)`, [item_id, member_id]);
  }

  async removeFromMember(item_id: string, member_id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM item_members WHERE item_id = ? AND member_id = ?`, [item_id, member_id]);
  }

  async assignToWholeFamily(item_id: string, family_id: string): Promise<void> {
    const db = await getDb();
    await db.run(`INSERT OR IGNORE INTO item_whole_family (item_id, family_id) VALUES (?, ?)`, [item_id, family_id]);
  }

  async removeFromWholeFamily(item_id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM item_whole_family WHERE item_id = ?`, [item_id]);
  }

  async getCategoriesForItem(item_id: string): Promise<Category[]> {
    const db = await getDb();
    // Prefer single column on items
    const row: any = await db.get(`SELECT categoryId FROM items WHERE id = ?`, [item_id]);
    if (!row || !row.categoryId) return [];
    const cat = await db.get(`SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL`, [row.categoryId]);
    return cat ? [cat] : [];
  }

  async getItemsForCategory(category_id: string): Promise<any[]> {
    const db = await getDb();
    // Select items whose categoryId matches
    const items: Item[] = await db.all(`SELECT * FROM items WHERE categoryId = ? AND deleted_at IS NULL`, [category_id]);
    // For each item, fetch member IDs and whole family assignment
    const result = [];
    for (const item of items) {
      // Check if assigned to whole family
      const wholeRow = await db.get(`SELECT 1 FROM item_whole_family WHERE item_id = ?`, [item.id]);
      let memberIds: string[] = [];
      if (!wholeRow) {
        // Only fetch member assignments if not assigned to whole family
        const memberRows = await db.all(`SELECT member_id FROM item_members WHERE item_id = ?`, [item.id]);
        memberIds = memberRows.map((r: any) => r.member_id).filter(Boolean);
      }
      result.push({
        ...item,
        memberIds,
        wholeFamily: !!wholeRow,
      });
    }
    return result;
  }

  async getMembersForItem(item_id: string): Promise<User[]> {
    const db = await getDb();
    return db.all(`SELECT u.* FROM users u JOIN item_members im ON u.id = im.member_id WHERE im.item_id = ? AND u.deleted_at IS NULL`, [item_id]);
  }

  async isAssignedToWholeFamily(item_id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.get(`SELECT 1 FROM item_whole_family WHERE item_id = ?`, [item_id]);
    return !!result;
  }

    // Returns the item if assigned to whole family, or null otherwise
    async getWholeFamilyAssignment(item_id: string): Promise<Item | null> {
      const db = await getDb();
      const assignment = await db.get(`SELECT i.* FROM items i JOIN item_whole_family iwf ON i.id = iwf.item_id WHERE i.id = ? AND i.deleted_at IS NULL`, [item_id]);
      return assignment || null;
    }
}


  import { Template, TemplateCategory, TemplateItem } from './server-types';

  export class TemplateRepository {
    async create(template: Partial<Template>): Promise<Template> {
      const db = await getDb();
      await db.run(
        `INSERT INTO templates (id, family_id, name, description, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        [
          template.id,
          template.family_id,
          template.name,
          template.description || '',
          template.created_at,
          template.updated_at
        ]
      );
      const created = await this.findById(template.id ?? '');
      if (!created) throw new Error('Failed to create template');
      return created;
    }

    async findById(id: string): Promise<Template | undefined> {
      const db = await getDb();
      return db.get(`SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL`, [id]);
    }

    async findAll(family_id: string): Promise<Template[]> {
      const db = await getDb();
      return db.all(`SELECT * FROM templates WHERE family_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`, [family_id]);
    }

    async update(id: string, updates: Partial<Template>): Promise<Template | undefined> {
      const db = await getDb();
      const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updates);
      await db.run(`UPDATE templates SET ${fields}, updated_at = ? WHERE id = ?`, [...values, new Date().toISOString(), id]);
      return this.findById(id);
    }

    async softDelete(id: string): Promise<void> {
      const db = await getDb();
      await db.run(`UPDATE templates SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
    }

    // Category assignments
    async assignCategory(template_id: string, category_id: string): Promise<void> {
      const db = await getDb();
      await db.run(`INSERT OR IGNORE INTO template_categories (template_id, category_id) VALUES (?, ?)`, [template_id, category_id]);
    }

    async removeCategory(template_id: string, category_id: string): Promise<void> {
      const db = await getDb();
      await db.run(`DELETE FROM template_categories WHERE template_id = ? AND category_id = ?`, [template_id, category_id]);
    }

    async getCategories(template_id: string): Promise<TemplateCategory[]> {
      const db = await getDb();
      return db.all(`SELECT * FROM template_categories WHERE template_id = ?`, [template_id]);
    }

    async getCategoriesForTemplate(template_id: string): Promise<Category[]> {
      const db = await getDb();
      return db.all(`SELECT c.* FROM categories c JOIN template_categories tc ON c.id = tc.category_id WHERE tc.template_id = ? AND c.deleted_at IS NULL`, [template_id]);
    }

    // Item assignments
    async assignItem(template_id: string, item_id: string): Promise<void> {
      const db = await getDb();
      await db.run(`INSERT OR IGNORE INTO template_items (template_id, item_id) VALUES (?, ?)`, [template_id, item_id]);
    }

    async removeItem(template_id: string, item_id: string): Promise<void> {
      const db = await getDb();
      await db.run(`DELETE FROM template_items WHERE template_id = ? AND item_id = ?`, [template_id, item_id]);
    }

    async getItems(template_id: string): Promise<TemplateItem[]> {
      const db = await getDb();
      return db.all(`SELECT * FROM template_items WHERE template_id = ?`, [template_id]);
    }

    async getItemsForTemplate(template_id: string): Promise<Item[]> {
      const db = await getDb();
      return db.all(`SELECT i.* FROM items i JOIN template_items ti ON i.id = ti.item_id WHERE ti.template_id = ? AND i.deleted_at IS NULL`, [template_id]);
    }

    // Dynamic expansion: get all items for a template (categories + items)
    async getExpandedItems(template_id: string): Promise<Item[]> {
      const db = await getDb();
      // Get items from referenced categories
      const categoryRows = await db.all(`SELECT category_id FROM template_categories WHERE template_id = ?`, [template_id]);
      const categoryIds = categoryRows.map((row: any) => row.category_id);
      let items: Item[] = [];
      if (categoryIds.length > 0) {
        // Include items that are assigned via the single-column items.categoryId
        const placeholders = categoryIds.map(() => '?').join(',');
        const categoryItems = await db.all(
          `SELECT DISTINCT i.* FROM items i WHERE i.categoryId IN (${placeholders}) AND i.deleted_at IS NULL`,
          categoryIds
        );
        items = items.concat(categoryItems);
      }
      // Get individually referenced items
      const itemRows = await db.all(`SELECT item_id FROM template_items WHERE template_id = ?`, [template_id]);
      const itemIds = itemRows.map((row: any) => row.item_id);
      if (itemIds.length > 0) {
        const directItems = await db.all(`SELECT * FROM items WHERE id IN (${itemIds.map(() => '?').join(',')}) AND deleted_at IS NULL`, itemIds);
        items = items.concat(directItems);
      }
      // Remove duplicates by item id
      const uniqueItems = Object.values(items.reduce<{[id: string]: Item}>((acc, item) => { acc[item.id] = item; return acc; }, {}));
      return uniqueItems as Item[];
    }

    // Find templates that reference a given item (directly) - return template ids
    async getTemplatesReferencingItem(item_id: string): Promise<string[]> {
      const db = await getDb();
      const rows: any[] = await db.all(`SELECT template_id FROM template_items WHERE item_id = ?`, [item_id]);
      return rows.map(r => r.template_id);
    }

    // Find templates that reference a given category (directly) - return template ids
    async getTemplatesReferencingCategory(category_id: string): Promise<string[]> {
      const db = await getDb();
      const rows: any[] = await db.all(`SELECT template_id FROM template_categories WHERE category_id = ?`, [category_id]);
      return rows.map(r => r.template_id);
    }
  }

  import { PackingList, PackingListItem } from './server-types';

  export class PackingListRepository {
    async create(packingList: Partial<PackingList>): Promise<PackingList> {
      const db = await getDb();
      await db.run(
        `INSERT INTO packing_lists (id, family_id, name, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [
          packingList.id,
          packingList.family_id,
          packingList.name,
          packingList.created_at,
          packingList.updated_at
        ]
      );
      const created = await this.findById(packingList.id ?? '');
      if (!created) throw new Error('Failed to create packing list');
      return created;
    }

    async findById(id: string): Promise<PackingList | undefined> {
      const db = await getDb();
      return db.get(`SELECT * FROM packing_lists WHERE id = ? AND deleted_at IS NULL`, [id]);
    }

    async findAll(family_id: string): Promise<PackingList[]> {
      const db = await getDb();
      return db.all(`SELECT * FROM packing_lists WHERE family_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`, [family_id]);
    }

    // Get member IDs that are selected for a packing list (lightweight)
    async getMemberIdsForPackingList(packing_list_id: string): Promise<string[]> {
      const db = await getDb();
      const rows: any[] = await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [packing_list_id]);
      return rows.map(r => r.member_id).filter(Boolean);
    }

    // Set the selected member IDs for a packing list. Validates members belong to the list's family.
    async setMemberIdsForPackingList(packing_list_id: string, memberIds: string[]): Promise<void> {
      const db = await getDb();
      // Validate packing list exists and get family_id
      const pl: any = await db.get(`SELECT family_id FROM packing_lists WHERE id = ? AND deleted_at IS NULL`, [packing_list_id]);
      if (!pl) throw new Error('Packing list not found');
      const familyId = pl.family_id;

      // Validate that all memberIds belong to the same family
      if (Array.isArray(memberIds) && memberIds.length > 0) {
        const placeholders = memberIds.map(() => '?').join(',');
        const rows: any[] = await db.all(`SELECT id FROM users WHERE id IN (${placeholders}) AND familyId = ? AND deleted_at IS NULL`, [...memberIds, familyId]);
        const foundIds = new Set(rows.map(r => r.id));
        const invalid = memberIds.filter(m => !foundIds.has(m));
        if (invalid.length > 0) throw new Error('One or more memberIds are invalid for this family');
      }

      // Perform replace inside a transaction
      try {
        await db.run('BEGIN TRANSACTION');
        // Delete existing rows
        await db.run(`DELETE FROM packing_list_members WHERE packing_list_id = ?`, [packing_list_id]);
        if (Array.isArray(memberIds) && memberIds.length > 0) {
          for (const m of memberIds) {
            await db.run(`INSERT OR IGNORE INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [packing_list_id, m]);
          }
        }
        await db.run('COMMIT');
      } catch (err) {
        try { await db.run('ROLLBACK'); } catch (e) {}
        throw err;
      }
    }

    async update(id: string, updates: Partial<PackingList>): Promise<PackingList | undefined> {
      const db = await getDb();
      const keys = Object.keys(updates || {});
      // If no fields to update (common when callers remove auxiliary props like templateIds),
      // just touch updated_at to avoid generating invalid SQL like `SET , updated_at = ?`.
      if (keys.length === 0) {
        await db.run(`UPDATE packing_lists SET updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
      } else {
        const fields = keys.map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);
        await db.run(`UPDATE packing_lists SET ${fields}, updated_at = ? WHERE id = ?`, [...values, new Date().toISOString(), id]);
      }
      return this.findById(id);
    }

    async softDelete(id: string): Promise<void> {
      const db = await getDb();
      await db.run(`UPDATE packing_lists SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
    }

    // Packing list items
    async addItem(packing_list_id: string, item_id: string, added_during_packing: boolean = false): Promise<PackingListItem> {
      const db = await getDb();
      // Defensive: avoid creating duplicate packing-list rows referencing the same master item.
      // If an existing row exists for (packing_list_id, item_id) return it instead of inserting a new one.
      try {
        const existing = await this.findItem(packing_list_id, item_id);
        if (existing) {
          return existing;
        }
      } catch (e) {
        // ignore and proceed to insertion on unexpected errors
      }
      const id = crypto.randomUUID();
      await db.run(
        `INSERT INTO packing_list_items (id, packing_list_id, item_id, checked, added_during_packing, created_at)
         VALUES (?, ?, ?, 0, ?, ?)`,
        [id, packing_list_id, item_id, added_during_packing ? 1 : 0, new Date().toISOString()]
      );
      const created = await this.findItemById(id);
      if (!created) throw new Error('Failed to add item to packing list');
      try {
        // Broadcast so dashboards and other clients update in real-time
        broadcastEvent({ type: 'packing_list_changed', listId: packing_list_id, data: { item: created, change: 'add_item' } });
      } catch (e) {}
      return created;
    }

    async removeItem(packing_list_id: string, item_id: string): Promise<void> {
      const db = await getDb();
      // Find packing list item rows matching the packing_list_id and item_id
      const rows: any[] = await db.all(`SELECT id FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [packing_list_id, item_id]);
      if (rows && rows.length > 0) {
        const ids = rows.map(r => r.id);
          // Delete associated checks first
          const placeholders = ids.map(() => '?').join(',');
          await db.run(`DELETE FROM packing_list_item_checks WHERE packing_list_item_id IN (${placeholders})`, ids);
          // Delete any per-item not-needed rows to satisfy foreign keys
          await db.run(`DELETE FROM packing_list_item_not_needed WHERE packing_list_item_id IN (${placeholders})`, ids);
          // Also remove provenance rows referencing these packing-list items to satisfy FKs
          await db.run(`DELETE FROM packing_list_item_templates WHERE packing_list_item_id IN (${placeholders})`, ids);
      }
      // Remove the packing list item rows
      await db.run(`DELETE FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [packing_list_id, item_id]);
    }

    // Remove a packing-list item by its packing_list_items.id (safe for one-off and legacy rows)
    async removeItemByPliId(packing_list_item_id: string, broadcast: boolean = false): Promise<void> {
      const db = await getDb();
      
      // Get packing list info and referenced master item before deletion for broadcast
      let listId: string | undefined;
      let referencedItemId: string | undefined;
      if (broadcast) {
        try {
          const pli = await db.get(`SELECT packing_list_id, item_id FROM packing_list_items WHERE id = ?`, [packing_list_item_id]);
          listId = pli?.packing_list_id;
          referencedItemId = pli?.item_id;
        } catch (e) {
          // Continue without broadcast if we can't get list info
        }
      } else {
        // Even if not broadcasting, fetch referenced item id so we can possibly cleanup one-off master items
        try {
          const pli = await db.get(`SELECT item_id FROM packing_list_items WHERE id = ?`, [packing_list_item_id]);
          referencedItemId = pli?.item_id;
        } catch (e) {
          // ignore
        }
      }
      
      // Use a SAVEPOINT so this operation can be nested inside an outer transaction.
      const sp = 'sp_remove_pli_' + crypto.randomUUID().replace(/-/g, '');
      try {
        await db.run(`SAVEPOINT ${sp}`);
        await db.run(`DELETE FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [packing_list_item_id]);
        // Also delete any provenance rows that reference this packing-list-item (packing_list_item_templates)
        await db.run(`DELETE FROM packing_list_item_templates WHERE packing_list_item_id = ?`, [packing_list_item_id]);
          // Also delete any per-item not-needed rows that reference this packing-list-item
          await db.run(`DELETE FROM packing_list_item_not_needed WHERE packing_list_item_id = ?`, [packing_list_item_id]);
        await db.run(`DELETE FROM packing_list_items WHERE id = ?`, [packing_list_item_id]);
        await db.run(`RELEASE ${sp}`);
        
        // Broadcast removal event if requested and we have list info
        if (broadcast && listId) {
          try {
            broadcastEvent({ type: 'packing_list_changed', listId: listId, data: { itemId: packing_list_item_id, change: 'remove_item' } });
          } catch (e) {
            console.warn('Failed to broadcast item removal event', { packing_list_item_id, listId, err: e });
          }
        }
        // If the removed packing-list-item referenced a master item that was a one-off,
        // and there are no remaining packing-list_items referencing that master, then
        // soft-delete the master item and clean up related item_members / whole-family rows
        // to avoid orphaned one-off masters showing on dashboards.
        try {
          if (referencedItemId) {
            const itemRow: any = await db.get(`SELECT id, isOneOff, deleted_at FROM items WHERE id = ?`, [referencedItemId]);
            if (itemRow && itemRow.isOneOff && !itemRow.deleted_at) {
              const refCountRow: any = await db.get(`SELECT COUNT(1) as cnt FROM packing_list_items WHERE item_id = ?`, [referencedItemId]);
              const cnt = refCountRow ? (refCountRow.cnt || refCountRow['COUNT(1)'] || 0) : 0;
              if (cnt === 0) {
                const now = new Date().toISOString();
                await db.run(`UPDATE items SET deleted_at = ? WHERE id = ?`, [now, referencedItemId]);
                // cleanup member assignments and whole-family flags
                await db.run(`DELETE FROM item_members WHERE item_id = ?`, [referencedItemId]);
                await db.run(`DELETE FROM item_whole_family WHERE item_id = ?`, [referencedItemId]);
              }
            }
          }
        } catch (cleanupErr) {
          console.warn('Failed to cleanup orphaned one-off master item after packing-list-item delete', { packing_list_item_id, referencedItemId, err: cleanupErr });
        }
      } catch (e) {
        try {
          await db.run(`ROLLBACK TO ${sp}`);
          await db.run(`RELEASE ${sp}`);
        } catch (rb) {
          // ignore rollback errors
        }
        console.error('Error removing packing_list_item by pli id', { packing_list_item_id, err: e });
        throw e;
      }
    }

    async setItemChecked(packing_list_id: string, item_id: string, checked: boolean): Promise<PackingListItem | undefined> {
      const db = await getDb();
      await db.run(`UPDATE packing_list_items SET checked = ? WHERE packing_list_id = ? AND item_id = ?`, [checked ? 1 : 0, packing_list_id, item_id]);
      return this.findItem(packing_list_id, item_id);
    }

    async findItemById(id: string): Promise<PackingListItem | undefined> {
      const db = await getDb();
      return db.get(`SELECT * FROM packing_list_items WHERE id = ?`, [id]);
    }

    async findItem(packing_list_id: string, item_id: string): Promise<PackingListItem | undefined> {
      const db = await getDb();
      return db.get(`SELECT * FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [packing_list_id, item_id]);
    }

    async getItems(packing_list_id: string): Promise<PackingListItem[]> {
      const db = await getDb();
      return db.all(`SELECT * FROM packing_list_items WHERE packing_list_id = ?`, [packing_list_id]);
    }

    // Get packing list items with assigned members and whole-family flag
    async getItemsWithMembers(packing_list_id: string): Promise<any[]> {
      const db = await getDb();
  // Only include packing-list rows that reference an existing, non-deleted master item.
  // This enforces the invariant: packing list items are references to master items.
  // Use LEFT JOIN so packing_list_items that were added as one-off (no master item)
  // are still returned. Previously a JOIN excluded those rows which caused UI
  // state like not_needed to be lost on refresh for one-off items.
  const items = await db.all(
    `SELECT pli.*, i.name as master_name, i.id as master_id, i.isOneOff as master_is_one_off
     FROM packing_list_items pli
     LEFT JOIN items i ON i.id = pli.item_id AND i.deleted_at IS NULL
     WHERE pli.packing_list_id = ?`,
    [packing_list_id]
  );

  if (!items || items.length === 0) return [];

  // Bulk-fetch the single category for each master item (items are assigned to at most one category)
  const masterIds = Array.from(new Set(items.map((it: any) => it.master_id).filter(Boolean)));
  let categoriesByMaster: Record<string, { id: string; name: string } | null> = {};
  if (masterIds.length > 0) {
    // Fetch category for each master item via items.categoryId
    const catRows = await db.all(
      `SELECT i.id as item_id, c.id as category_id, c.name as category_name FROM items i LEFT JOIN categories c ON c.id = i.categoryId WHERE i.id IN (${masterIds.map(() => '?').join(',')}) AND i.deleted_at IS NULL`,
      masterIds
    );
    for (const r of catRows) {
      if (r.category_id) categoriesByMaster[r.item_id] = { id: r.category_id, name: r.category_name };
      else categoriesByMaster[r.item_id] = null;
    }
  }

  // Get members assigned to the referenced master items
  // Use LEFT JOINs so items without a master item (one-offs) are still included
  // and simply have no assigned members. Filter deleted users in the JOIN.
  const memberRows = await db.all(
    `SELECT pli.id as packing_list_item_id, u.id as member_id, u.name, u.username
     FROM packing_list_items pli
     LEFT JOIN item_members im ON im.item_id = pli.item_id
     LEFT JOIN users u ON u.id = im.member_id AND u.deleted_at IS NULL
     WHERE pli.packing_list_id = ?`,
    [packing_list_id]
  );

  // Whole-family flags for the referenced master items
  const wholeRows = await db.all(
    `SELECT pli.id as packing_list_item_id FROM packing_list_items pli JOIN items i ON i.id = pli.item_id AND i.deleted_at IS NULL JOIN item_whole_family iwf ON iwf.item_id = i.id WHERE pli.packing_list_id = ?`,
    [packing_list_id]
  );

  const membersByPli: Record<string, any[]> = {};
  for (const r of memberRows) {
    if (!membersByPli[r.packing_list_item_id]) membersByPli[r.packing_list_item_id] = [];
    membersByPli[r.packing_list_item_id].push({ id: r.member_id, name: r.name, username: r.username });
  }

  const wholeSet = new Set(wholeRows.map((r: any) => r.packing_list_item_id));

  // Get template provenance rows for packing-list items (which templates contributed each pli)
  const provRows = await db.all(
    `SELECT plt.packing_list_item_id, plt.template_id FROM packing_list_item_templates plt JOIN packing_list_items pli ON plt.packing_list_item_id = pli.id WHERE pli.packing_list_id = ?`,
    [packing_list_id]
  );
  const templatesByPli: Record<string, string[]> = {};
  for (const pr of provRows) {
    templatesByPli[pr.packing_list_item_id] = templatesByPli[pr.packing_list_item_id] || [];
    templatesByPli[pr.packing_list_item_id].push(pr.template_id);
  }

  // For each packing-list row, derive name and assignments from the master item.
  // When a packing-list row references a master item prefer the master's name as
  // the single source of truth. If the row is a true legacy one-off (no master)
  // fall back to the per-row display_name so older UI flows still have a label.
  return items.map((it: any) => ({
    ...it,
    // Prefer master_name when present, otherwise fall back to the packing-list row's display_name
    name: it.master_name || it.display_name || '',
    // Hide per-row display_name from clients when a master exists so clients
    // can't accidentally prefer stale cached values over the canonical master name.
    display_name: it.master_id ? null : (it.display_name || null),
    members: membersByPli[it.id] || [],
    whole_family: wholeSet.has(it.id),
    // single category object (if any) from the master item. Previously we returned an
    // array of categories per master; migrate callers to use `category`.
  category: it.master_id ? (categoriesByMaster[it.master_id] || null) : null,
    // template provenance ids (may be empty)
    template_ids: templatesByPli[it.id] || []
  }));
    }

    // Add a one-off item that does not reference a master item
    async addOneOffItem(packing_list_id: string, display_name: string, added_during_packing: boolean = true, memberIds?: string[], categoryId?: string, wholeFamily?: boolean): Promise<PackingListItem> {
      const db = await getDb();
      // Create a master item marked as one-off, then add it to the packing list by referencing the master item.
      const newItemId = crypto.randomUUID();
      const now = new Date().toISOString();
      const familyRow: any = await db.get(`SELECT family_id FROM packing_lists WHERE id = ?`, [packing_list_id]);
      const familyId = familyRow ? familyRow.family_id : null;
      // Persist optional categoryId on the master item row if provided
      if (categoryId) {
        // Ensure the number of placeholders matches the number of parameters.
        // Columns: id, familyId, name, isOneOff, categoryId, created_at, updated_at, deleted_at
        // We use a literal 1 for isOneOff and NULL for deleted_at, so we need 6 placeholders.
  const sql = `INSERT INTO items (id, familyId, name, isOneOff, categoryId, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`;
  const params = [newItemId, familyId, display_name, 1, categoryId, now, now];
        try {
          await db.run(sql, params);
        } catch (e) {
          console.error('Failed INSERT INTO items (category):', { sql, params, err: e });
          throw e;
        }
      } else {
        const sql = `INSERT INTO items (id, familyId, name, isOneOff, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)`;
        const params = [newItemId, familyId, display_name, 1, now, now];
        try {
          await db.run(sql, params);
        } catch (e) {
          console.error('Failed INSERT INTO items (no category):', { sql, params, err: e });
          throw e;
        }
      }
      // Assign to specified members if provided
      if (Array.isArray(memberIds) && memberIds.length > 0) {
        for (const m of memberIds) {
          await db.run(`INSERT OR IGNORE INTO item_members (item_id, member_id) VALUES (?, ?)`, [newItemId, m]);
        }
      }
      // Persist whole-family assignment on the master item if requested
      if (wholeFamily) {
        try {
          await db.run(`INSERT OR REPLACE INTO item_whole_family (item_id, family_id) VALUES (?, ?)`,[newItemId, familyId]);
        } catch (e) {
          console.warn('Failed to persist whole-family assignment for one-off item', { newItemId, familyId, err: e });
        }
      }
      // Insert packing_list_items referencing the new master item.
      // Do NOT persist a per-row `display_name` here — the canonical name lives on
      // the master `items` row (isOneOff = 1). Historically we cached display_name
      // on the packing_list_items row for legacy flows; avoid that to keep the
      // master item name as the single source of truth.
      const id = crypto.randomUUID();
      await db.run(
        `INSERT INTO packing_list_items (id, packing_list_id, item_id, display_name, checked, added_during_packing, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [id, packing_list_id, newItemId, display_name || null, added_during_packing ? 1 : 0, now]
      );
      const created = await this.findItemById(id);
      if (!created) throw new Error('Failed to add one-off item to packing list');
      try {
        // Broadcast one-off adds as well
        broadcastEvent({ type: 'packing_list_changed', listId: packing_list_id, data: { item: created, change: 'add_item' } });
      } catch (e) {}
      return created;
    }

    // Per-user check state stored in packing_list_item_checks
    async setUserItemChecked(packing_list_item_id: string, member_id: string | null, checked: boolean): Promise<void> {
      const db = await getDb();
      // Debug: log incoming values (only in non-production to avoid hot-path overhead)
      if (process.env.NODE_ENV !== 'production') console.log('setUserItemChecked called with', { packing_list_item_id, member_id, checked });
      let existing: any | undefined;
      if (member_id === null) {
        existing = await db.get(`SELECT id, checked FROM packing_list_item_checks WHERE packing_list_item_id = ? AND member_id IS NULL`, [packing_list_item_id]);
      } else {
        existing = await db.get(`SELECT id, checked FROM packing_list_item_checks WHERE packing_list_item_id = ? AND member_id = ?`, [packing_list_item_id, member_id]);
      }
      if (process.env.NODE_ENV !== 'production') console.log('Existing check row:', existing);
      const now = new Date().toISOString();
      if (existing) {
        const newVal = checked ? 1 : 0;
        await db.run(`UPDATE packing_list_item_checks SET checked = ?, checked_at = ? WHERE id = ?`, [newVal, now, existing.id]);
        if (process.env.NODE_ENV !== 'production') console.log('Updated check row id', existing.id, 'set to', newVal);
      } else {
        const id = crypto.randomUUID();
        const newVal = checked ? 1 : 0;
        if (member_id === null) {
          await db.run(`INSERT INTO packing_list_item_checks (id, packing_list_item_id, member_id, checked, checked_at) VALUES (?, ?, NULL, ?, ?)`, [id, packing_list_item_id, newVal, now]);
          if (process.env.NODE_ENV !== 'production') console.log('Inserted check row id', id, 'member_id NULL set to', newVal);
          // When a whole-family check is created, remove any lingering per-member check rows
          // so the canonical state for this packing-list-item is the NULL-member row only.
          try {
            await db.run(`DELETE FROM packing_list_item_checks WHERE packing_list_item_id = ? AND member_id IS NOT NULL`, [packing_list_item_id]);
            console.log('Deleted per-member check rows for pli', packing_list_item_id, 'after inserting NULL-member row');
          } catch (e) {
            console.warn('Failed to delete per-member check rows after inserting NULL-member row', { packing_list_item_id, err: e });
          }
        } else {
          await db.run(`INSERT INTO packing_list_item_checks (id, packing_list_item_id, member_id, checked, checked_at) VALUES (?, ?, ?, ?, ?)`, [id, packing_list_item_id, member_id, newVal, now]);
          if (process.env.NODE_ENV !== 'production') console.log('Inserted check row id', id, 'member_id', member_id, 'set to', newVal);
        }
      }
      // If an existing NULL-member row was updated, also remove per-member rows to keep canonical state
      if (member_id === null) {
        try {
          await db.run(`DELETE FROM packing_list_item_checks WHERE packing_list_item_id = ? AND member_id IS NOT NULL`, [packing_list_item_id]);
          console.log('Ensured per-member check rows removed for pli', packing_list_item_id, 'after NULL-member update');
        } catch (e) {
          console.warn('Failed to delete per-member check rows after NULL-member update', { packing_list_item_id, err: e });
        }
      }
        if (process.env.NODE_ENV !== 'production') {
          try {
            const rows = await db.all(`SELECT id, packing_list_item_id, member_id, checked, checked_at FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [packing_list_item_id]);
            console.log('packing_list_item_checks rows for pli', packing_list_item_id, rows);
          } catch (e) {
            console.warn('Failed to read back check rows for debug', e);
          }
        }
    }

    async getUserItemChecks(packing_list_id: string): Promise<any[]> {
      const db = await getDb();
      return db.all(`SELECT pc.* FROM packing_list_item_checks pc JOIN packing_list_items pli ON pc.packing_list_item_id = pli.id WHERE pli.packing_list_id = ?`, [packing_list_id]);
    }

    // Template assignment helpers
    // Update assigned templates for a packing list. If removeItemsForRemovedTemplates is true,
    // remove packing-list-items that were attributed only to templates that are being removed
    // (with an extra safeguard to not remove items that appear to have been manually added prior to
    // their provenance entries).
    async setTemplatesForPackingList(packing_list_id: string, templateIds: string[], removeItemsForRemovedTemplates: boolean = false): Promise<void> {
      const db = await getDb();
      try {
        await db.run('BEGIN TRANSACTION');

        // Determine currently assigned templates
        const existingRows: any[] = await db.all(`SELECT template_id FROM packing_list_templates WHERE packing_list_id = ?`, [packing_list_id]);
        const existingIds = existingRows.map(r => r.template_id);
        const toRemove = existingIds.filter(id => !((templateIds || []).includes(id)));

        // Optionally remove items that were produced by templates we're removing
        if (removeItemsForRemovedTemplates && toRemove.length > 0) {
          console.log('Template removal cleanup: templates to remove for list', { packing_list_id, toRemove });
          const cleanupStart = Date.now();
          for (const tid of toRemove) {
            // Find packing-list-item provenance rows for this template within the packing list
            const attributedRows: any[] = await db.all(
              `SELECT plt.packing_list_item_id, plt.created_at as provenance_created_at, pli.created_at as pli_created_at
               FROM packing_list_item_templates plt JOIN packing_list_items pli ON plt.packing_list_item_id = pli.id
               WHERE plt.template_id = ? AND pli.packing_list_id = ?`,
              [tid, packing_list_id]
            );
            console.log('  processing template', tid, 'found attributedRows count=', attributedRows.length);

            for (const r of attributedRows) {
              const pliId = r.packing_list_item_id;

              console.log('    attributed pli:', pliId, 'prov_created_at:', r.provenance_created_at, 'pli_created_at:', r.pli_created_at);

              // Fetch all provenance created_at values for this pli (before we delete any provenance rows)
              const provRows: any[] = await db.all(`SELECT created_at FROM packing_list_item_templates WHERE packing_list_item_id = ?`, [pliId]);
              const provCreatedAts = provRows.map(p => p.created_at).filter(Boolean);
              const earliestProv = provCreatedAts.length > 0 ? provCreatedAts.reduce((a, b) => (a < b ? a : b)) : null;
              console.log('      provenance timestamps for pli', pliId, provCreatedAts, 'earliest=', earliestProv);

              // Delete the provenance entry for the template being removed
              await db.run(`DELETE FROM packing_list_item_templates WHERE packing_list_item_id = ? AND template_id = ?`, [pliId, tid]);

              // If there are any remaining provenance entries for this pli, leave it alone
              const remaining = await db.get(`SELECT 1 FROM packing_list_item_templates WHERE packing_list_item_id = ? LIMIT 1`, [pliId]);
              if (remaining) continue;

              // No remaining provenance — decide whether it's safe to delete the packing-list-item
              // If the packing-list-item appears to have been manually added before provenance (i.e., pli.created_at < earliest provenance),
              // treat it as manually added and do not delete.
              const pliRow: any = await db.get(`SELECT created_at FROM packing_list_items WHERE id = ?`, [pliId]);
              const pliCreated = pliRow ? pliRow.created_at : null;
              // Convert timestamps to ms for comparison, and allow a small threshold
              let wasManuallyAdded = false;
              if (earliestProv && pliCreated) {
                const pliMs = new Date(pliCreated).getTime();
                const provMs = new Date(earliestProv).getTime();
                wasManuallyAdded = pliMs + MANUAL_ADDED_THRESHOLD_MS < provMs;
              }
              console.log('      pliCreated=', pliCreated, 'earliestProv=', earliestProv, 'wasManuallyAdded=', !!wasManuallyAdded);
              if (!wasManuallyAdded) {
                try {
                  console.log('      deleting pli', pliId, 'because no remaining provenance and not manually added');
                  const delStart = Date.now();
                  await this.removeItemByPliId(pliId, true); // broadcast: true for template cleanup removals
                  console.log('      deleted pli', pliId, 'in', Date.now() - delStart, 'ms (with broadcast)');
                } catch (e) {
                  // Log and continue: don't abort whole operation if a single delete fails
                  console.error('Error removing packing list item during template removal cleanup', { packing_list_item_id: pliId, err: e });
                }
              } else {
                console.log('      keeping pli', pliId, 'because it appears manually added');
              }
            }
          }
          console.log('Template removal cleanup for list', packing_list_id, 'completed in', Date.now() - cleanupStart, 'ms');
        }

        // Persist the new set of template assignments
        await db.run(`DELETE FROM packing_list_templates WHERE packing_list_id = ?`, [packing_list_id]);
        const now = new Date().toISOString();
        for (const tid of templateIds || []) {
          await db.run(`INSERT OR IGNORE INTO packing_list_templates (packing_list_id, template_id, created_at) VALUES (?, ?, ?)`, [packing_list_id, tid, now]);
        }

        await db.run('COMMIT');
      } catch (err) {
        try { await db.run('ROLLBACK'); } catch (e) {}
        throw err;
      }
    }

    async getTemplatesForPackingList(packing_list_id: string): Promise<string[]> {
      const db = await getDb();
      const rows: any[] = await db.all(`SELECT template_id FROM packing_list_templates WHERE packing_list_id = ?`, [packing_list_id]);
      return rows.map(r => r.template_id);
    }

    async getPackingListsForTemplate(template_id: string): Promise<PackingList[]> {
      const db = await getDb();
      return db.all(`SELECT pl.* FROM packing_lists pl JOIN packing_list_templates plt ON pl.id = plt.packing_list_id WHERE plt.template_id = ? AND pl.deleted_at IS NULL`, [template_id]);
    }

    async setNotNeeded(packing_list_item_id: string, notNeeded: boolean): Promise<any> {
      const db = await getDb();
      await db.run(`UPDATE packing_list_items SET not_needed = ? WHERE id = ?`, [notNeeded ? 1 : 0, packing_list_item_id]);
      // Read back the row and return for verification/logging
      try {
        const row = await db.get(`SELECT * FROM packing_list_items WHERE id = ?`, [packing_list_item_id]);
        console.log('setNotNeeded updated row:', { id: packing_list_item_id, not_needed: row && row.not_needed });
        return row;
      } catch (e) {
        console.warn('setNotNeeded: failed to read back updated row', { packing_list_item_id, err: e });
        return null;
      }
    }

    // Per-member not-needed tracking (mimics packing_list_item_checks)
    async setUserItemNotNeeded(packing_list_item_id: string, member_id: string | null, notNeeded: boolean): Promise<void> {
      const db = await getDb();
      const now = new Date().toISOString();
      // Use member_id nullable to support whole-family not-needed rows (member_id NULL)
      console.log('setUserItemNotNeeded called with', { packing_list_item_id, member_id, notNeeded });
      let existing: any | undefined;
      if (member_id === null) {
        existing = await db.get(`SELECT id FROM packing_list_item_not_needed WHERE packing_list_item_id = ? AND member_id IS NULL`, [packing_list_item_id]);
      } else {
        existing = await db.get(`SELECT id FROM packing_list_item_not_needed WHERE packing_list_item_id = ? AND member_id = ?`, [packing_list_item_id, member_id]);
      }
      if (existing) {
        await db.run(`UPDATE packing_list_item_not_needed SET not_needed = ?, updated_at = ? WHERE id = ?`, [notNeeded ? 1 : 0, now, existing.id]);
        console.log('Updated packing_list_item_not_needed id', existing.id, 'to', notNeeded ? 1 : 0);
      } else {
        const id = crypto.randomUUID();
        await db.run(`INSERT INTO packing_list_item_not_needed (id, packing_list_item_id, member_id, not_needed, updated_at) VALUES (?, ?, ?, ?, ?)`, [id, packing_list_item_id, member_id, notNeeded ? 1 : 0, now]);
        console.log('Inserted packing_list_item_not_needed id', id, 'member_id', member_id, 'not_needed', notNeeded ? 1 : 0);
      }
    }

    async getNotNeededForList(packing_list_id: string): Promise<any[]> {
      const db = await getDb();
      // Only return rows that are currently marked not_needed (not_needed = 1)
      return db.all(`SELECT n.* FROM packing_list_item_not_needed n JOIN packing_list_items pli ON n.packing_list_item_id = pli.id WHERE pli.packing_list_id = ? AND n.not_needed = 1`, [packing_list_id]);
    }

    // Promote a one-off list item (display_name) to a master item and convert the list row to reference it
    async promoteOneOffToMaster(packing_list_item_id: string, family_id: string, createTemplate: boolean = false, templateName?: string): Promise<{newItemId: string, updatedRow: PackingListItem}> {
      const db = await getDb();
  const row = await this.findItemById(packing_list_item_id) as any;
  if (!row) throw new Error('Packing list item not found');
  if (row.item_id) {
    // Already promoted — return existing master id and the current row
    return { newItemId: row.item_id, updatedRow: row as PackingListItem };
  }
  const newItemId = crypto.randomUUID();
  await db.run(`INSERT INTO items (id, familyId, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [newItemId, family_id, row.display_name || 'Unnamed Item', new Date().toISOString(), new Date().toISOString()]);
  await db.run(`UPDATE packing_list_items SET item_id = ?, display_name = NULL WHERE id = ?`, [newItemId, packing_list_item_id]);
      const updated = await this.findItemById(packing_list_item_id);
      if (createTemplate && templateName) {
        const templateRepo = new TemplateRepository();
        const templateId = crypto.randomUUID();
        await templateRepo.create({ id: templateId, family_id: family_id, name: templateName, description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        await templateRepo.assignItem(templateId, newItemId);
      }
      return { newItemId, updatedRow: updated as PackingListItem };
    }

    // Populate packing list from template
    async populateFromTemplate(packing_list_id: string, template_id: string): Promise<void> {
      const templateRepo = new TemplateRepository();
      const items = await templateRepo.getExpandedItems(template_id);
      const db = await getDb();
      for (const item of items) {
        // avoid adding duplicate master items to the packing list
        const exists = await db.get(`SELECT id FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [packing_list_id, item.id]);
        if (!exists) {
          const created = await this.addItem(packing_list_id, item.id);
          // record provenance mapping from packing_list_item -> template
          try {
            // Debug: ensure referenced rows exist before insert
            try {
              const pliExists = await db.get(`SELECT id, packing_list_id FROM packing_list_items WHERE id = ?`, [created.id]);
              const tplExists = await db.get(`SELECT id FROM templates WHERE id = ?`, [template_id]);
              if (!pliExists) console.error('Pre-insert check: packing_list_item missing', { packing_list_item_id: created.id });
              if (!tplExists) console.error('Pre-insert check: template missing', { template_id });
            } catch (chkErr) {
              console.error('Error during pre-insert checks for provenance (populate)', { packing_list_item_id: created.id, template_id, err: chkErr });
            }
            await db.run(`INSERT OR IGNORE INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, ?)`, [created.id, template_id, new Date().toISOString()]);
          } catch (e: any) {
            console.error('Failed to record packing_list_item_templates provenance (insert)', { packing_list_item_id: created.id, template_id, err: e });
            // Possible race: another reconcile removed/changed the packing_list_item. Attempt to ensure the packing_list_item exists and retry.
            const recheck = await db.get(`SELECT id FROM packing_list_items WHERE id = ?`, [created.id]);
            if (!recheck) {
              // recreate the packing_list_item and retry
              try {
                const recreated = await this.addItem(packing_list_id, item.id);
                await db.run(`INSERT OR IGNORE INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, ?)`, [recreated.id, template_id, new Date().toISOString()]);
              } catch (e2) {
                console.error('Retry failed recording provenance after recreating pli', { packing_list_item_id: created.id, template_id, err: e2 });
              }
            }
          }
        } else {
          // Ensure provenance exists for existing row (id from exists)
          try {
            try {
              const pliExists = await db.get(`SELECT id, packing_list_id FROM packing_list_items WHERE id = ?`, [exists.id]);
              const tplExists = await db.get(`SELECT id FROM templates WHERE id = ?`, [template_id]);
              if (!pliExists) console.error('Pre-insert check: packing_list_item missing (existing path)', { packing_list_item_id: exists.id });
              if (!tplExists) console.error('Pre-insert check: template missing (existing path)', { template_id });
            } catch (chkErr) {
              console.error('Error during pre-insert checks for provenance (populate-existing)', { packing_list_item_id: exists.id, template_id, err: chkErr });
            }
            await db.run(`INSERT OR IGNORE INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, ?)`, [exists.id, template_id, new Date().toISOString()]);
          } catch (e: any) {
            console.error('Failed to ensure provenance for existing packing_list_item (insert)', { packing_list_item_id: exists.id, template_id, err: e });
            // If the existing row was removed concurrently, recreate it and retry
            const recheck = await db.get(`SELECT id FROM packing_list_items WHERE id = ?`, [exists.id]);
            if (!recheck) {
              try {
                const recreated = await this.addItem(packing_list_id, item.id);
                await db.run(`INSERT OR IGNORE INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, ?)`, [recreated.id, template_id, new Date().toISOString()]);
              } catch (e2) {
                console.error('Retry failed ensuring provenance for recreated pli', { packing_list_item_id: exists.id, template_id, err: e2 });
              }
            }
          }
        }
      }
    }

    // Provenance helpers
    async removeProvenanceForPackingListItem(packing_list_item_id: string, template_id: string): Promise<void> {
      const db = await getDb();
      await db.run(`DELETE FROM packing_list_item_templates WHERE packing_list_item_id = ? AND template_id = ?`, [packing_list_item_id, template_id]);
    }

    async getPackingListItemsForTemplateInList(packing_list_id: string, template_id: string): Promise<string[]> {
      const db = await getDb();
      const rows: any[] = await db.all(`SELECT plt.packing_list_item_id FROM packing_list_item_templates plt JOIN packing_list_items pli ON plt.packing_list_item_id = pli.id WHERE plt.template_id = ? AND pli.packing_list_id = ?`, [template_id, packing_list_id]);
      return rows.map(r => r.packing_list_item_id);
    }

    // Reconcile a packing list against a template: ensure items from template are present and
    // remove packing-list-items that were produced by the template but are no longer in the template.
    async reconcilePackingListAgainstTemplate(packing_list_id: string, template_id: string): Promise<void> {
      const templateRepo = new TemplateRepository();
      const desiredItems = await templateRepo.getExpandedItems(template_id);
      const desiredIds = new Set(desiredItems.map(i => i.id));
      const db = await getDb();

      // Run the reconcile in a transaction to avoid races between concurrent propagation runs
      try {
        await db.run('BEGIN IMMEDIATE');
      } catch (e) {
        // If BEGIN fails, continue without transaction but log (best-effort)
        console.warn('Could not start immediate transaction for reconcile, proceeding without it', { err: e });
      }

      // Ensure desired items are present and provenance recorded
      for (const item of desiredItems) {
        const existing = await db.get(`SELECT id FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [packing_list_id, item.id]);
        if (!existing) {
          const created = await this.addItem(packing_list_id, item.id);
          try {
            try {
              const pliExists = await db.get(`SELECT id, packing_list_id FROM packing_list_items WHERE id = ?`, [created.id]);
              const tplExists = await db.get(`SELECT id FROM templates WHERE id = ?`, [template_id]);
              if (!pliExists) console.error('Pre-insert check: packing_list_item missing (reconcile-created)', { packing_list_item_id: created.id });
              if (!tplExists) console.error('Pre-insert check: template missing (reconcile-created)', { template_id });
            } catch (chkErr) {
              console.error('Error during pre-insert checks for provenance (reconcile-created)', { packing_list_item_id: created.id, template_id, err: chkErr });
            }
            await db.run(`INSERT OR IGNORE INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, ?)`, [created.id, template_id, new Date().toISOString()]);
          } catch (e) {
            console.error('Failed to record provenance during reconcile (insert)', { packing_list_item_id: created.id, template_id, err: e });
            // Attempt to recover by ensuring the pli exists and retrying once
            const recheck = await db.get(`SELECT id FROM packing_list_items WHERE id = ?`, [created.id]);
            if (!recheck) {
              try {
                const recreated = await this.addItem(packing_list_id, item.id);
                await db.run(`INSERT OR IGNORE INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, ?)`, [recreated.id, template_id, new Date().toISOString()]);
              } catch (e2) {
                console.error('Retry failed recording provenance during reconcile (insert)', { packing_list_item_id: created.id, template_id, err: e2 });
              }
            }
          }
        } else {
            try {
              try {
                const pliExists = await db.get(`SELECT id, packing_list_id FROM packing_list_items WHERE id = ?`, [existing.id]);
                const tplExists = await db.get(`SELECT id FROM templates WHERE id = ?`, [template_id]);
                if (!pliExists) console.error('Pre-insert check: packing_list_item missing (reconcile-existing)', { packing_list_item_id: existing.id });
                if (!tplExists) console.error('Pre-insert check: template missing (reconcile-existing)', { template_id });
              } catch (chkErr) {
                console.error('Error during pre-insert checks for provenance (reconcile-existing)', { packing_list_item_id: existing.id, template_id, err: chkErr });
              }
              await db.run(`INSERT OR IGNORE INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, ?)`, [existing.id, template_id, new Date().toISOString()]);
            } catch (e) {
              console.error('Failed to ensure provenance during reconcile (insert)', { packing_list_item_id: existing.id, template_id, err: e });
            // If the existing pli was removed concurrently, recreate and retry
            const recheck = await db.get(`SELECT id FROM packing_list_items WHERE id = ?`, [existing.id]);
            if (!recheck) {
              try {
                const recreated = await this.addItem(packing_list_id, item.id);
                await db.run(`INSERT OR IGNORE INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, ?)`, [recreated.id, template_id, new Date().toISOString()]);
              } catch (e2) {
                console.error('Retry failed ensuring provenance during reconcile (insert)', { packing_list_item_id: existing.id, template_id, err: e2 });
              }
            }
          }
        }
      }

      // Remove packing-list-items that are attributed to this template but not present in desiredIds
      const attributedRows: any[] = await db.all(`SELECT plt.packing_list_item_id, pli.item_id FROM packing_list_item_templates plt JOIN packing_list_items pli ON plt.packing_list_item_id = pli.id WHERE plt.template_id = ? AND pli.packing_list_id = ?`, [template_id, packing_list_id]);
      for (const r of attributedRows) {
        if (!desiredIds.has(r.item_id)) {
          // Remove the provenance entry for this template
          try {
            await db.run(`DELETE FROM packing_list_item_templates WHERE packing_list_item_id = ? AND template_id = ?`, [r.packing_list_item_id, template_id]);
          } catch (e) {
            console.error('Error deleting provenance row during reconcile', { packing_list_item_id: r.packing_list_item_id, template_id, err: e });
            throw e;
          }

          // Check if the packing_list_item still has any provenance from other templates
          let remaining: any;
          try {
            remaining = await db.get(`SELECT 1 FROM packing_list_item_templates WHERE packing_list_item_id = ? LIMIT 1`, [r.packing_list_item_id]);
          } catch (e) {
            console.error('Error checking remaining provenance during reconcile', { packing_list_item_id: r.packing_list_item_id, err: e });
            throw e;
          }
          if (!remaining) {
            // No other templates reference it; safe to remove the packing-list-item
            try {
              await this.removeItemByPliId(r.packing_list_item_id, true); // broadcast: true for template reconciliation removals
            } catch (e) {
              console.error('Error removing packing list item by pli id during reconcile', { packing_list_item_id: r.packing_list_item_id, err: e });
              // Don't abort the whole reconciliation on a delete error; log and continue
            }
          }
        }
      }

      try {
        await db.run('COMMIT');
      } catch (e) {
        try {
          await db.run('ROLLBACK');
        } catch (rbErr) {
          console.error('Error rolling back reconcile transaction', { err: rbErr });
        }
        throw e;
      }
    }
  }
