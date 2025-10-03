import { getDb } from './db';
import sqlite3 from 'sqlite3';
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
        user.name,
        user.username || null,
        user.password_hash || null,
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
      `INSERT INTO items (id, familyId, name, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item.id, item.familyId, item.name, item.created_at, item.updated_at, null]
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
    return db.all(`SELECT * FROM items WHERE familyId = ? AND deleted_at IS NULL ORDER BY created_at DESC`, [familyId]);
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`UPDATE items SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
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
