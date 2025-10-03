import { getDb } from './db';
import sqlite3 from 'sqlite3';
import { User, Family } from './server-types';

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
