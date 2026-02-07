import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';

const DB_PATH = process.env.DATABASE_PATH || './data/stores.db';

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables immediately so prepared statements work at import time
db.exec(`
  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'woocommerce',
    status TEXT NOT NULL DEFAULT 'provisioning',
    namespace TEXT NOT NULL,
    store_url TEXT,
    admin_url TEXT,
    error_message TEXT,
    provision_started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    provision_finished_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrate: add new columns if upgrading from older schema
const columns = db.prepare("PRAGMA table_info(stores)").all().map((c) => c.name);
if (!columns.includes('provision_started_at')) {
  db.exec("ALTER TABLE stores ADD COLUMN provision_started_at DATETIME");
  db.exec("UPDATE stores SET provision_started_at = created_at WHERE provision_started_at IS NULL");
}
if (!columns.includes('provision_finished_at')) {
  db.exec("ALTER TABLE stores ADD COLUMN provision_finished_at DATETIME");
}
// Ensure name column is NOT unique and slug column IS unique
// (handles both fresh slug migration and partial migration from previous deploy)
const nameColInfo = db.prepare("PRAGMA table_info(stores)").all().find((c) => c.name === 'name');
const hasSlug = columns.includes('slug');
const nameIsUnique = db.prepare("PRAGMA index_list(stores)").all().some((idx) => {
  const cols = db.prepare(`PRAGMA index_info('${idx.name}')`).all();
  return idx.unique && cols.length === 1 && cols[0].name === 'name';
});

if (!hasSlug || nameIsUnique) {
  // Recreate table: add slug if missing, remove UNIQUE from name
  db.exec(`
    ALTER TABLE stores RENAME TO stores_old;
    CREATE TABLE stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'woocommerce',
      status TEXT NOT NULL DEFAULT 'provisioning',
      namespace TEXT NOT NULL,
      store_url TEXT,
      admin_url TEXT,
      error_message TEXT,
      provision_started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      provision_finished_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO stores (id, name, slug, type, status, namespace, store_url, admin_url, error_message, provision_started_at, provision_finished_at, created_at, updated_at)
      SELECT id, name, COALESCE(slug, name), type, status, namespace, store_url, admin_url, error_message, provision_started_at, provision_finished_at, created_at, updated_at
      FROM stores_old;
    DROP TABLE stores_old;
  `);
}

// Mark any stale "provisioning" stores as "failed" on startup
const stale = db
  .prepare("UPDATE stores SET status = 'failed', error_message = 'Server restarted during provisioning' WHERE status = 'provisioning'")
  .run();

if (stale.changes > 0) {
  logger.warn({ count: stale.changes }, 'Marked stale provisioning stores as failed');
}

logger.info('Database initialized');

export default db;
