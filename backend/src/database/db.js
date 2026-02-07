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
    name TEXT UNIQUE NOT NULL,
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

// Mark any stale "provisioning" stores as "failed" on startup
const stale = db
  .prepare("UPDATE stores SET status = 'failed', error_message = 'Server restarted during provisioning' WHERE status = 'provisioning'")
  .run();

if (stale.changes > 0) {
  logger.warn({ count: stale.changes }, 'Marked stale provisioning stores as failed');
}

logger.info('Database initialized');

export default db;
