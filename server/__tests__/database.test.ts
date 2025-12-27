import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { Database } from 'sqlite';

describe('Database', () => {
  let db: Database;

  beforeEach(async () => {
    db = await getDb();
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('Database Connection', () => {
    it('should establish database connection', async () => {
      expect(db).toBeDefined();
      expect(typeof db.get).toBe('function');
      expect(typeof db.run).toBe('function');
      expect(typeof db.all).toBe('function');
    });

    it('should enable foreign keys', async () => {
      const result = await db.get('PRAGMA foreign_keys');
      expect(result.foreign_keys).toBe(1);
    });
  });

  describe('Schema Creation', () => {
    it('should create users table', async () => {
      const tableInfo = await db.all("PRAGMA table_info(users)");
      const columnNames = tableInfo.map((col: any) => col.name);
      
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('username');
      expect(columnNames).toContain('password_hash');
      expect(columnNames).toContain('role');
      expect(columnNames).toContain('must_change_password');
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('familyId');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
      expect(columnNames).toContain('deleted_at');
    });

    it('should create families table', async () => {
      const tableInfo = await db.all("PRAGMA table_info(families)");
      const columnNames = tableInfo.map((col: any) => col.name);
      
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
      expect(columnNames).toContain('deleted_at');
    });

    it('should create audit_log table', async () => {
      const tableInfo = await db.all("PRAGMA table_info(audit_log)");
      const columnNames = tableInfo.map((col: any) => col.name);
      
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('username');
      expect(columnNames).toContain('action');
      expect(columnNames).toContain('details');
      expect(columnNames).toContain('timestamp');
    });
  });

  describe('Constraints and Indexes', () => {
    it('should have unique constraint on username', async () => {
      const indexes = await db.all("PRAGMA index_list(users)");
      const uniqueIndexes = indexes.filter((idx: any) => idx.unique === 1);
      
      expect(uniqueIndexes.length).toBeGreaterThan(0);
    });

    it('should have foreign key constraint from users to families', async () => {
      const foreignKeys = await db.all("PRAGMA foreign_key_list(users)");
      const familyFK = foreignKeys.find((fk: any) => fk.table === 'families');
      
      expect(familyFK).toBeDefined();
      expect(familyFK.from).toBe('familyId');
      expect(familyFK.to).toBe('id');
    });

    it('should have created indexes', async () => {
      const allIndexes = await db.all("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'");
      const indexNames = allIndexes.map((idx: any) => idx.name);
      
      expect(indexNames).toContain('idx_users_username');
      expect(indexNames).toContain('idx_users_family');
      expect(indexNames).toContain('idx_users_deleted');
      expect(indexNames).toContain('idx_families_deleted');
    });
  });

  describe('Role Constraints', () => {
    it('should enforce role constraint on users table', async () => {
      try {
        await db.run(
          "INSERT INTO users (id, username, password_hash, role, must_change_password, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          ['test-id', 'testuser', 'hash', 'InvalidRole', 0, 'test@example.com', new Date().toISOString(), new Date().toISOString()]
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('CHECK constraint failed');
      }
    });

    it('should accept valid roles', async () => {
      const validRoles = ['SystemAdmin', 'FamilyAdmin', 'FamilyMember'];
      
      for (const role of validRoles) {
        await expect(
          db.run(
            "INSERT INTO users (id, username, password_hash, role, must_change_password, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [`test-${role}`, `user-${role}`, 'hash', role, 0, `${role}@example.com`, new Date().toISOString(), new Date().toISOString()]
          )
        ).resolves.not.toThrow();
      }
    });
  });

  describe('Default Values', () => {
    it('should set default timestamps', async () => {
      await db.run(
        "INSERT INTO users (id, username, password_hash, role, must_change_password, email) VALUES (?, ?, ?, ?, ?, ?)",
        ['test-defaults', 'defaultuser', 'hash', 'FamilyMember', 0, 'default@example.com']
      );

      const user = await db.get("SELECT * FROM users WHERE id = ?", ['test-defaults']);
      
      expect(user.created_at).toBeDefined();
      expect(user.updated_at).toBeDefined();
      expect(new Date(user.created_at).getTime()).toBeGreaterThan(Date.now() - 5000); // Within last 5 seconds
    });

    it('should set default must_change_password to 1', async () => {
      await db.run(
        "INSERT INTO users (id, username, password_hash, role, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ['test-default-password', 'defaultpassworduser', 'hash', 'FamilyMember', 'default@example.com', new Date().toISOString(), new Date().toISOString()]
      );

      const user = await db.get("SELECT * FROM users WHERE id = ?", ['test-default-password']);
      
      expect(user.must_change_password).toBe(1);
    });
  });

  describe('Transaction Support', () => {
    it('should support transactions', async () => {
      await db.run('BEGIN TRANSACTION');
      
      await db.run(
        "INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        ['test-family', 'Test Family', new Date().toISOString(), new Date().toISOString()]
      );

      await db.run(
        "INSERT INTO users (id, username, password_hash, role, must_change_password, email, familyId, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ['test-user-tx', 'txuser', 'hash', 'FamilyMember', 0, 'tx@example.com', 'test-family', new Date().toISOString(), new Date().toISOString()]
      );

      await db.run('COMMIT');

      const user = await db.get("SELECT * FROM users WHERE id = ?", ['test-user-tx']);
      const family = await db.get("SELECT * FROM families WHERE id = ?", ['test-family']);
      
      expect(user).toBeDefined();
      expect(family).toBeDefined();
      expect(user.familyId).toBe('test-family');
    });

    it('should rollback failed transactions', async () => {
      await db.run('BEGIN TRANSACTION');
      
      await db.run(
        "INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        ['test-family-rollback', 'Test Family Rollback', new Date().toISOString(), new Date().toISOString()]
      );

      await db.run('ROLLBACK');

      const family = await db.get("SELECT * FROM families WHERE id = ?", ['test-family-rollback']);
      expect(family).toBeUndefined();
    });
  });
});