import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

let dbInstance: Database | null = null;
let isInitializing = false;
let initializationPromise: Promise<void> | null = null;

// Database schemas separated for maintainability
const SCHEMAS = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      username TEXT UNIQUE,
      password_hash TEXT,
      role TEXT CHECK (role IN ('SystemAdmin', 'FamilyAdmin', 'FamilyMember')),
      must_change_password INTEGER DEFAULT 1,
      email TEXT,
      familyId TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (familyId) REFERENCES families(id)
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      familyId TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (familyId) REFERENCES families(id)
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      familyId TEXT NOT NULL,
      name TEXT NOT NULL,
      checked INTEGER DEFAULT 0,
      isOneOff INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (familyId) REFERENCES families(id)
    );
    CREATE TABLE IF NOT EXISTS item_categories (
      item_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      PRIMARY KEY (item_id, category_id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    CREATE TABLE IF NOT EXISTS item_members (
      item_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      PRIMARY KEY (item_id, member_id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (member_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS item_whole_family (
      item_id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (family_id) REFERENCES families(id)
    );

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY (family_id) REFERENCES families(id)
      );

      CREATE TABLE IF NOT EXISTS template_categories (
        template_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        PRIMARY KEY (template_id, category_id),
        FOREIGN KEY (template_id) REFERENCES templates(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );

      CREATE TABLE IF NOT EXISTS template_items (
        template_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        PRIMARY KEY (template_id, item_id),
        FOREIGN KEY (template_id) REFERENCES templates(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS packing_lists (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY (family_id) REFERENCES families(id)
      );

      CREATE TABLE IF NOT EXISTS packing_list_items (
        id TEXT PRIMARY KEY,
        packing_list_id TEXT NOT NULL,
        item_id TEXT,
        display_name TEXT,
        checked INTEGER DEFAULT 0,
        added_during_packing INTEGER DEFAULT 0,
        not_needed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS packing_list_item_checks (
        id TEXT PRIMARY KEY,
        packing_list_item_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        checked INTEGER DEFAULT 0,
        checked_at TEXT,
        FOREIGN KEY (packing_list_item_id) REFERENCES packing_list_items(id),
        FOREIGN KEY (member_id) REFERENCES users(id)
      );
  `,
  families: `
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active_packing_list_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )`,
  audit_log: `
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
  indexes: `
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_family ON users(familyId);
    CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_families_deleted ON families(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_categories_family ON categories(familyId);
    CREATE INDEX IF NOT EXISTS idx_categories_deleted ON categories(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_items_family ON items(familyId);
    CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_item_categories_item ON item_categories(item_id);
    CREATE INDEX IF NOT EXISTS idx_item_categories_category ON item_categories(category_id);
    CREATE INDEX IF NOT EXISTS idx_item_members_item ON item_members(item_id);
    CREATE INDEX IF NOT EXISTS idx_item_members_member ON item_members(member_id);
    CREATE INDEX IF NOT EXISTS idx_item_whole_family_family ON item_whole_family(family_id);
    CREATE INDEX IF NOT EXISTS idx_templates_family ON templates(family_id);
    CREATE INDEX IF NOT EXISTS idx_templates_deleted ON templates(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_template_categories_template ON template_categories(template_id);
    CREATE INDEX IF NOT EXISTS idx_template_categories_category ON template_categories(category_id);
    CREATE INDEX IF NOT EXISTS idx_template_items_template ON template_items(template_id);
    CREATE INDEX IF NOT EXISTS idx_template_items_item ON template_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_packing_lists_family ON packing_lists(family_id);
    CREATE INDEX IF NOT EXISTS idx_packing_lists_deleted ON packing_lists(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_packing_list_items_packing_list ON packing_list_items(packing_list_id);
    CREATE INDEX IF NOT EXISTS idx_packing_list_items_item ON packing_list_items(item_id);
  `
};

async function initializeDatabase(db: Database): Promise<void> {
  if (isInitializing && initializationPromise) {
    await initializationPromise;
    return;
  }
  
  if (isInitializing) return;
  
  isInitializing = true;
  initializationPromise = (async () => {
    try {
      // Enable foreign keys
      await db.exec('PRAGMA foreign_keys = ON');
      
      // Create tables in correct order (families first due to foreign key)
      await db.exec(SCHEMAS.families);
      await db.exec(SCHEMAS.users);
      await db.exec(SCHEMAS.audit_log);
      await db.exec(SCHEMAS.indexes);

      // Migration: ensure expected columns exist on legacy databases
      try {
        // helper to check and add a column if missing
        const ensureColumn = async (table: string, column: string, definition: string) => {
          const cols: any[] = await db.all(`PRAGMA table_info(${table})`);
          const found = cols.some(c => c.name === column);
          if (!found) {
            console.log(`⚙️ Adding missing column ${column} to ${table}`);
            await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
          }
        };

        // packing_list_items should have display_name TEXT and not_needed INTEGER defaults
        await ensureColumn('packing_list_items', 'display_name', 'TEXT');
        await ensureColumn('packing_list_items', 'not_needed', "INTEGER DEFAULT 0");
  // Ensure items.isOneOff exists
  await ensureColumn('items', 'isOneOff', 'INTEGER DEFAULT 0');
      
        // No automatic packing_list_items schema rebuild here. Schema migrations
        // are handled via an explicit migration framework (see project notes).

        // ...existing migration logic complete. No automatic cleanup here.
      } catch (merr) {
        console.warn('Migration step failed (non-fatal):', merr);
      }

      console.log('📄 Database schema initialized successfully');
      // (One-time cleanup removed)
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    } finally {
      isInitializing = false;
      initializationPromise = null;
    }
  })();
  
  await initializationPromise;
}

export async function getDb(): Promise<Database> {
  // Check if current instance is closed or invalid
  if (dbInstance) {
    try {
      // Test if the database connection is still valid
      await dbInstance.get('SELECT 1');
    } catch (error) {
      // Database is closed or invalid, reset it
      dbInstance = null;
    }
  }

  if (!dbInstance) {
    try {
  // Vitest sets a global VITEST flag; additionally respect NODE_ENV=test
  // Use an in-memory DB for tests to avoid file-based locking and ensure clean state.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const isTest = process.env.NODE_ENV === 'test' || (typeof global !== 'undefined' && (global as any).VITEST) || process.env.VITEST;
      const filename = isTest ? ':memory:' : './travel-list.sqlite';
      
      dbInstance = await open({
        filename,
        driver: sqlite3.Database,
      });
      
      await initializeDatabase(dbInstance);
      
      // Handle connection errors
      dbInstance.on('error', (err: Error) => {
        console.error('💥 Database error:', err);
      });
      
    } catch (error) {
      console.error('💥 Failed to open database:', error);
      dbInstance = null;
      throw error;
    }
  }
  return dbInstance;
}

// Migration helpers removed: automatic packing_list_items rebuilds are no longer performed here.

// Graceful shutdown
export async function closeDb(): Promise<void> {
  if (dbInstance) {
    try {
      await dbInstance.close();
      console.log('🔐 Database connection closed');
    } catch (error) {
      // Handle already closed database gracefully
      console.log('🔐 Database connection already closed');
    } finally {
      dbInstance = null;
      isInitializing = false;
      initializationPromise = null;
    }
  }
}
