import { getDb } from './db';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';
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
    return db.all(`SELECT * FROM users WHERE familyId = ? AND deleted_at IS NULL ORDER BY created_at ASC`, [familyId]);
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
    return db.all(`SELECT * FROM categories WHERE familyId = ? AND deleted_at IS NULL ORDER BY created_at DESC`, [familyId]);
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`UPDATE categories SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
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
    await db.run(`INSERT OR IGNORE INTO item_categories (item_id, category_id) VALUES (?, ?)`, [item_id, category_id]);
  }

  async removeFromCategory(item_id: string, category_id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM item_categories WHERE item_id = ? AND category_id = ?`, [item_id, category_id]);
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
    return db.all(`SELECT c.* FROM categories c JOIN item_categories ic ON c.id = ic.category_id WHERE ic.item_id = ? AND c.deleted_at IS NULL`, [item_id]);
  }

  async getItemsForCategory(category_id: string): Promise<Item[]> {
    const db = await getDb();
    return db.all(`SELECT i.* FROM items i JOIN item_categories ic ON i.id = ic.item_id WHERE ic.category_id = ? AND i.deleted_at IS NULL`, [category_id]);
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
        const categoryItems = await db.all(`SELECT i.* FROM items i JOIN item_categories ic ON i.id = ic.item_id WHERE ic.category_id IN (${categoryIds.map(() => '?').join(',')}) AND i.deleted_at IS NULL`, categoryIds);
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

    async update(id: string, updates: Partial<PackingList>): Promise<PackingList | undefined> {
      const db = await getDb();
      const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updates);
      await db.run(`UPDATE packing_lists SET ${fields}, updated_at = ? WHERE id = ?`, [...values, new Date().toISOString(), id]);
      return this.findById(id);
    }

    async softDelete(id: string): Promise<void> {
      const db = await getDb();
      await db.run(`UPDATE packing_lists SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
    }

    // Packing list items
    async addItem(packing_list_id: string, item_id: string, added_during_packing: boolean = false): Promise<PackingListItem> {
      const db = await getDb();
      const id = crypto.randomUUID();
      await db.run(
        `INSERT INTO packing_list_items (id, packing_list_id, item_id, checked, added_during_packing, created_at)
         VALUES (?, ?, ?, 0, ?, ?)`,
        [id, packing_list_id, item_id, added_during_packing ? 1 : 0, new Date().toISOString()]
      );
      const created = await this.findItemById(id);
      if (!created) throw new Error('Failed to add item to packing list');
      return created;
    }

    async removeItem(packing_list_id: string, item_id: string): Promise<void> {
      const db = await getDb();
      // Find packing list item rows matching the packing_list_id and item_id
      const rows: any[] = await db.all(`SELECT id FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [packing_list_id, item_id]);
      if (rows && rows.length > 0) {
        const ids = rows.map(r => r.id);
        // Delete associated checks first
        for (const id of ids) {
          await db.run(`DELETE FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [id]);
        }
      }
      // Remove the packing list item rows
      await db.run(`DELETE FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [packing_list_id, item_id]);
    }

    // Remove a packing-list item by its packing_list_items.id (safe for one-off and legacy rows)
    async removeItemByPliId(packing_list_item_id: string): Promise<void> {
      const db = await getDb();
      await db.run(`DELETE FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [packing_list_item_id]);
      await db.run(`DELETE FROM packing_list_items WHERE id = ?`, [packing_list_item_id]);
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
  const items = await db.all(
    `SELECT pli.*, i.name as master_name, i.id as master_id
     FROM packing_list_items pli
     JOIN items i ON i.id = pli.item_id AND i.deleted_at IS NULL
     WHERE pli.packing_list_id = ?`,
    [packing_list_id]
  );

  if (!items || items.length === 0) return [];

  // Get members assigned to the referenced master items
  const memberRows = await db.all(
    `SELECT pli.id as packing_list_item_id, u.id as member_id, u.name, u.username
     FROM packing_list_items pli
     JOIN items i ON i.id = pli.item_id AND i.deleted_at IS NULL
     JOIN item_members im ON im.item_id = i.id
     JOIN users u ON u.id = im.member_id
     WHERE pli.packing_list_id = ? AND u.deleted_at IS NULL`,
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

  // For each packing-list row, derive name and assignments from the master item (no display_name fallback)
  return items.map((it: any) => ({
    ...it,
    name: it.master_name || '',
    members: membersByPli[it.id] || [],
    whole_family: wholeSet.has(it.id)
  }));
    }

    // Add a one-off item that does not reference a master item
    async addOneOffItem(packing_list_id: string, display_name: string, added_during_packing: boolean = true, memberIds?: string[]): Promise<PackingListItem> {
      const db = await getDb();
      // Create a master item marked as one-off, then add it to the packing list by referencing the master item.
      const newItemId = crypto.randomUUID();
      const now = new Date().toISOString();
      const familyRow: any = await db.get(`SELECT family_id FROM packing_lists WHERE id = ?`, [packing_list_id]);
      const familyId = familyRow ? familyRow.family_id : null;
      await db.run(
        `INSERT INTO items (id, familyId, name, isOneOff, created_at, updated_at, deleted_at) VALUES (?, ?, ?, 1, ?, ?, NULL)`,
        [newItemId, familyId, display_name, now, now]
      );
      // Assign to specified members if provided
      if (Array.isArray(memberIds) && memberIds.length > 0) {
        for (const m of memberIds) {
          await db.run(`INSERT OR IGNORE INTO item_members (item_id, member_id) VALUES (?, ?)`, [newItemId, m]);
        }
      }
      // Insert packing_list_items referencing the new master item, and also store display_name
      const id = crypto.randomUUID();
      await db.run(
        `INSERT INTO packing_list_items (id, packing_list_id, item_id, display_name, checked, added_during_packing, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [id, packing_list_id, newItemId, display_name, added_during_packing ? 1 : 0, now]
      );
      const created = await this.findItemById(id);
      if (!created) throw new Error('Failed to add one-off item to packing list');
      return created;
    }

    // Per-user check state stored in packing_list_item_checks
    async setUserItemChecked(packing_list_item_id: string, member_id: string, checked: boolean): Promise<void> {
      const db = await getDb();
      // Debug: log incoming values
      console.log('setUserItemChecked called with', { packing_list_item_id, member_id, checked });
      const existing = await db.get(`SELECT id, checked FROM packing_list_item_checks WHERE packing_list_item_id = ? AND member_id = ?`, [packing_list_item_id, member_id]);
      console.log('Existing check row:', existing);
      const now = new Date().toISOString();
      if (existing) {
        const newVal = checked ? 1 : 0;
        await db.run(`UPDATE packing_list_item_checks SET checked = ?, checked_at = ? WHERE id = ?`, [newVal, now, existing.id]);
        console.log('Updated check row id', existing.id, 'set to', newVal);
      } else {
        const id = crypto.randomUUID();
        const newVal = checked ? 1 : 0;
        await db.run(`INSERT INTO packing_list_item_checks (id, packing_list_item_id, member_id, checked, checked_at) VALUES (?, ?, ?, ?, ?)`, [id, packing_list_item_id, member_id, newVal, now]);
        console.log('Inserted check row id', id, 'set to', newVal);
      }
    }

    async getUserItemChecks(packing_list_id: string): Promise<any[]> {
      const db = await getDb();
      return db.all(`SELECT pc.* FROM packing_list_item_checks pc JOIN packing_list_items pli ON pc.packing_list_item_id = pli.id WHERE pli.packing_list_id = ?`, [packing_list_id]);
    }

    async setNotNeeded(packing_list_item_id: string, notNeeded: boolean): Promise<void> {
      const db = await getDb();
      await db.run(`UPDATE packing_list_items SET not_needed = ? WHERE id = ?`, [notNeeded ? 1 : 0, packing_list_item_id]);
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
      for (const item of items) {
        // avoid adding duplicate master items to the packing list
        const db = await getDb();
        const exists = await db.get(`SELECT 1 FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [packing_list_id, item.id]);
        if (!exists) {
          await this.addItem(packing_list_id, item.id);
        }
      }
    }
  }
