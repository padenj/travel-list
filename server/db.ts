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
      position INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (familyId) REFERENCES families(id)
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      familyId TEXT NOT NULL,
      categoryId TEXT,
      name TEXT NOT NULL,
      checked INTEGER DEFAULT 0,
      isOneOff INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (familyId) REFERENCES families(id)
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

    CREATE TABLE IF NOT EXISTS packing_list_members (
      packing_list_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      PRIMARY KEY (packing_list_id, member_id),
      FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES users(id)
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

      CREATE TABLE IF NOT EXISTS packing_list_templates (
        packing_list_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (packing_list_id, template_id),
        FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id),
        FOREIGN KEY (template_id) REFERENCES templates(id)
      );

      CREATE TABLE IF NOT EXISTS packing_list_item_templates (
        packing_list_item_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (packing_list_item_id, template_id),
        FOREIGN KEY (packing_list_item_id) REFERENCES packing_list_items(id),
        FOREIGN KEY (template_id) REFERENCES templates(id)
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
        member_id TEXT,
        checked INTEGER DEFAULT 0,
        checked_at TEXT,
        FOREIGN KEY (packing_list_item_id) REFERENCES packing_list_items(id),
        FOREIGN KEY (member_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS packing_list_item_not_needed (
        id TEXT PRIMARY KEY,
        packing_list_item_id TEXT NOT NULL,
        member_id TEXT,
        not_needed INTEGER DEFAULT 1,
        updated_at TEXT,
        FOREIGN KEY (packing_list_item_id) REFERENCES packing_list_items(id),
        FOREIGN KEY (member_id) REFERENCES users(id)
      );
      
      -- Table to record applied client sync operations for idempotency and audit
      CREATE TABLE IF NOT EXISTS sync_ops (
        op_id TEXT PRIMARY KEY,
        user_id TEXT,
        op_type TEXT,
        entity TEXT,
        entity_id TEXT,
        payload TEXT,
        status TEXT,
        server_ts TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
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
  packing_list_audit_log: `
    CREATE TABLE IF NOT EXISTS packing_list_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packing_list_id TEXT NOT NULL,
      packing_list_item_id TEXT,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      applies_to_scope TEXT NOT NULL CHECK (applies_to_scope IN ('family', 'member')),
      applies_to_member_id TEXT,
      details TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id),
      FOREIGN KEY (applies_to_member_id) REFERENCES users(id)
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

    CREATE INDEX IF NOT EXISTS idx_packing_list_audit_log_packing_list_id_id ON packing_list_audit_log(packing_list_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_packing_list_audit_log_packing_list_item_id_id ON packing_list_audit_log(packing_list_id, packing_list_item_id, id DESC);
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
      await db.exec(SCHEMAS.packing_list_audit_log);
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

        // Migration: audit rows should not be deleted when a packing_list_item is deleted.
        // Early versions created a FK (packing_list_item_id -> packing_list_items) with ON DELETE CASCADE,
        // which wiped list history on item removal. Rebuild the table to remove that FK.
        const migratePackingListAuditLogFK = async () => {
          try {
            const fkList: any[] = await db.all(`PRAGMA foreign_key_list(packing_list_audit_log)`);
            const hasPackingListItemFk = fkList.some(fk => fk.from === 'packing_list_item_id');
            if (!hasPackingListItemFk) return;

            console.log('⚙️ Rebuilding packing_list_audit_log to remove packing_list_item_id FK');
            await db.exec('PRAGMA foreign_keys = OFF');
            await db.exec('BEGIN');
            await db.exec(`
              CREATE TABLE IF NOT EXISTS packing_list_audit_log_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                packing_list_id TEXT NOT NULL,
                packing_list_item_id TEXT,
                actor_user_id TEXT,
                action TEXT NOT NULL,
                applies_to_scope TEXT NOT NULL CHECK (applies_to_scope IN ('family', 'member')),
                applies_to_member_id TEXT,
                details TEXT,
                metadata_json TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id) ON DELETE CASCADE,
                FOREIGN KEY (actor_user_id) REFERENCES users(id),
                FOREIGN KEY (applies_to_member_id) REFERENCES users(id)
              )
            `);
            await db.run(`
              INSERT INTO packing_list_audit_log_new (
                id,
                packing_list_id,
                packing_list_item_id,
                actor_user_id,
                action,
                applies_to_scope,
                applies_to_member_id,
                details,
                metadata_json,
                created_at
              )
              SELECT
                id,
                packing_list_id,
                packing_list_item_id,
                actor_user_id,
                action,
                applies_to_scope,
                applies_to_member_id,
                details,
                metadata_json,
                created_at
              FROM packing_list_audit_log
            `);
            await db.exec('DROP TABLE packing_list_audit_log');
            await db.exec('ALTER TABLE packing_list_audit_log_new RENAME TO packing_list_audit_log');
            await db.exec('COMMIT');
            await db.exec('PRAGMA foreign_keys = ON');
          } catch (err) {
            try {
              await db.exec('ROLLBACK');
            } catch {
              // ignore
            }
            try {
              await db.exec('PRAGMA foreign_keys = ON');
            } catch {
              // ignore
            }
            console.warn('Failed to migrate packing_list_audit_log FK; continuing', err);
          }
        };

        // packing_list_items should have display_name TEXT and not_needed INTEGER defaults
        await migratePackingListAuditLogFK();
        await ensureColumn('packing_list_items', 'display_name', 'TEXT');
        await ensureColumn('packing_list_items', 'not_needed', "INTEGER DEFAULT 0");
  // Ensure items.isOneOff exists
  await ensureColumn('items', 'isOneOff', 'INTEGER DEFAULT 0');
    // Ensure items.categoryId exists (single-category model)
    await ensureColumn('items', 'categoryId', 'TEXT');
    // Ensure categories.position exists for explicit ordering
    await ensureColumn('categories', 'position', 'INTEGER');
    // Ensure users.position exists for ordering family members
    await ensureColumn('users', 'position', 'INTEGER');
      
        // No automatic packing_list_items schema rebuild here. Schema migrations
        // are handled via an explicit migration framework (see project notes).

        // ...existing migration logic complete. No automatic cleanup here.
        // Ensure packing_list_item_checks.member_id is nullable. Some older DBs
        // had this column defined NOT NULL which prevents storing whole-family
        // checks (member_id = NULL). If the existing column is NOT NULL, recreate
        // the table with a nullable member_id and copy rows across.
        try {
          const colsChecks: any[] = await db.all(`PRAGMA table_info(packing_list_item_checks)`);
          const memberCol = colsChecks.find(c => c.name === 'member_id');
          if (memberCol && memberCol.notnull === 1) {
            console.log('⚙️ Migrating packing_list_item_checks to allow NULL member_id');
            await db.exec('PRAGMA foreign_keys = OFF');
            await db.exec(`
              CREATE TABLE IF NOT EXISTS packing_list_item_checks_new (
                id TEXT PRIMARY KEY,
                packing_list_item_id TEXT NOT NULL,
                member_id TEXT,
                checked INTEGER DEFAULT 0,
                checked_at TEXT,
                FOREIGN KEY (packing_list_item_id) REFERENCES packing_list_items(id),
                FOREIGN KEY (member_id) REFERENCES users(id)
              );
            `);
            // copy rows (member_id may be empty string in some old DBs; normalize to NULL)
            await db.exec(`INSERT INTO packing_list_item_checks_new (id, packing_list_item_id, member_id, checked, checked_at) SELECT id, packing_list_item_id, CASE WHEN member_id = '' THEN NULL ELSE member_id END, checked, checked_at FROM packing_list_item_checks`);
            await db.exec('DROP TABLE IF EXISTS packing_list_item_checks');
            await db.exec('ALTER TABLE packing_list_item_checks_new RENAME TO packing_list_item_checks');
            await db.exec('PRAGMA foreign_keys = ON');
            console.log('⚙️ packing_list_item_checks migration complete');
          }
        } catch (merr) {
          console.warn('Non-fatal: failed to migrate packing_list_item_checks to nullable member_id', merr);
        }
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
  const filename = isTest ? ':memory:' : (process.env.DB_FILE || './data/travel-list.sqlite');
      
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
