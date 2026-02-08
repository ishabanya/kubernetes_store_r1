import { v4 as uuidv4 } from 'uuid';
import db from '../database/db.js';
import woocommerceProvisioner from './woocommerceProvisioner.js';
import medusaProvisioner from './medusaProvisioner.js';
import logger from '../utils/logger.js';
import { slugify } from '../utils/nameValidator.js';

const MAX_STORES = parseInt(process.env.MAX_STORES || '10', 10);
const MAX_CONCURRENT_PROVISIONS = parseInt(process.env.MAX_CONCURRENT_PROVISIONS || '3', 10);

let activeProvisions = 0;
const provisionQueue = [];

const provisioners = {
  woocommerce: woocommerceProvisioner,
  medusa: medusaProvisioner,
};

// Prepared statements
const insertStore = db.prepare(`
  INSERT INTO stores (id, name, slug, type, status, namespace, store_url, admin_url, provision_started_at)
  VALUES (?, ?, ?, ?, 'provisioning', ?, NULL, NULL, CURRENT_TIMESTAMP)
`);

const updateStoreStatus = db.prepare(`
  UPDATE stores SET status = ?, store_url = ?, admin_url = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const getStoreById = db.prepare('SELECT * FROM stores WHERE id = ?');
const getStoreBySlug = db.prepare('SELECT * FROM stores WHERE slug = ?');
const getAllStores = db.prepare("SELECT * FROM stores WHERE status != 'deleted' ORDER BY created_at DESC");
const countActiveStores = db.prepare("SELECT COUNT(*) as count FROM stores WHERE status NOT IN ('deleted', 'failed')");
const deleteStoreRow = db.prepare("DELETE FROM stores WHERE id = ?");

const insertAuditLog = db.prepare(`
  INSERT INTO audit_log (store_id, action, details, ip_address)
  VALUES (?, ?, ?, ?)
`);

const getAuditLogs = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?');

const countByStatus = db.prepare("SELECT status, COUNT(*) as count FROM stores WHERE status != 'deleted' GROUP BY status");
const countTotal = db.prepare("SELECT COUNT(*) as count FROM stores WHERE status != 'deleted'");
const countFailed = db.prepare("SELECT COUNT(*) as count FROM stores WHERE status = 'failed'");
const avgProvisionDuration = db.prepare(`
  SELECT AVG(
    CAST((julianday(provision_finished_at) - julianday(provision_started_at)) * 86400 AS REAL)
  ) as avg_seconds
  FROM stores
  WHERE provision_finished_at IS NOT NULL AND status = 'ready'
`);
const setProvisionFinished = db.prepare(`
  UPDATE stores SET provision_finished_at = CURRENT_TIMESTAMP WHERE id = ?
`);

function normalizeIp(ip) {
  if (!ip || ip === 'system') return ip;
  // Strip ::ffff: IPv6-mapped IPv4 prefix
  return ip.replace(/^::ffff:/, '');
}

function audit(storeId, action, details, ip) {
  insertAuditLog.run(storeId, action, JSON.stringify(details), normalizeIp(ip));
}

export async function createStore({ name, type = 'woocommerce', adminUser = 'admin', adminPassword = null }, ip) {
  // Check max stores
  const { count } = countActiveStores.get();
  if (count >= MAX_STORES) {
    const err = new Error(`Maximum number of stores (${MAX_STORES}) reached`);
    err.status = 409;
    throw err;
  }

  const slug = slugify(name);
  if (!slug || slug.length < 2) {
    const err = new Error('Store name must contain at least 2 alphanumeric characters');
    err.status = 400;
    throw err;
  }

  // Check duplicate by slug
  const existing = getStoreBySlug.get(slug);
  if (existing && !['deleted', 'failed'].includes(existing.status)) {
    const err = new Error(`A store with a similar name already exists ("${existing.name}")`);
    err.status = 409;
    throw err;
  }

  // Remove old deleted/failed row so the slug can be reused
  if (existing) {
    deleteStoreRow.run(existing.id);
  }

  const id = uuidv4();
  const namespace = `store-${slug}`;

  insertStore.run(id, name, slug, type, namespace);
  audit(id, 'create', { name, slug, type }, ip);

  logger.info({ id, name, slug, type }, 'Store created, starting provisioning');

  // Enqueue provisioning with concurrency control
  enqueueProvision(id, slug, type, namespace, adminUser, adminPassword);

  return getStoreById.get(id);
}

function enqueueProvision(id, name, type, namespace, adminUser, adminPassword) {
  if (activeProvisions < MAX_CONCURRENT_PROVISIONS) {
    activeProvisions++;
    provisionStore(id, name, type, namespace, adminUser, adminPassword).finally(() => {
      activeProvisions--;
      drainQueue();
    });
  } else {
    logger.info({ id, name, queueLength: provisionQueue.length }, 'Queuing provision (concurrency limit reached)');
    provisionQueue.push({ id, name, type, namespace, adminUser, adminPassword });
  }
}

function drainQueue() {
  while (provisionQueue.length > 0 && activeProvisions < MAX_CONCURRENT_PROVISIONS) {
    const next = provisionQueue.shift();
    activeProvisions++;
    provisionStore(next.id, next.name, next.type, next.namespace, next.adminUser, next.adminPassword).finally(() => {
      activeProvisions--;
      drainQueue();
    });
  }
}

async function provisionStore(id, name, type, namespace, adminUser, adminPassword) {
  const provisioner = provisioners[type];
  if (!provisioner) {
    updateStoreStatus.run('failed', null, null, `Unknown store type: ${type}`, id);
    return;
  }

  try {
    const { storeUrl, adminUrl } = await provisioner.provision({
      id,
      name,
      namespace,
      adminUser,
      adminPassword,
    });

    setProvisionFinished.run(id);
    updateStoreStatus.run('ready', storeUrl, adminUrl, null, id);
    audit(id, 'provision_success', { storeUrl, adminUrl }, 'system');
    logger.info({ id, name, storeUrl }, 'Store provisioned successfully');
  } catch (err) {
    setProvisionFinished.run(id);
    updateStoreStatus.run('failed', null, null, err.message, id);
    audit(id, 'provision_failed', { error: err.message }, 'system');
    logger.error({ id, err: err.message }, 'Store provisioning failed');
  }
}

export async function listStores() {
  return getAllStores.all();
}

export async function getStore(id) {
  const store = getStoreById.get(id);
  if (!store || store.status === 'deleted') {
    const err = new Error('Store not found');
    err.status = 404;
    throw err;
  }
  return store;
}

export async function deleteStore(id, ip) {
  const store = getStoreById.get(id);
  if (!store || store.status === 'deleted') {
    const err = new Error('Store not found');
    err.status = 404;
    throw err;
  }

  updateStoreStatus.run('deleting', store.store_url, store.admin_url, null, id);
  audit(id, 'delete_start', { name: store.name }, ip);

  // Async deletion
  performDeletion(store).catch((err) => {
    logger.error({ id, err: err.message }, 'Store deletion failed');
  });

  return { message: 'Store deletion initiated' };
}

async function performDeletion(store) {
  const provisioner = provisioners[store.type];
  try {
    if (provisioner) {
      await provisioner.deprovision(store);
    }
    updateStoreStatus.run('deleted', null, null, null, store.id);
    audit(store.id, 'delete_success', { name: store.name }, 'system');
    logger.info({ id: store.id, name: store.name }, 'Store deleted');
  } catch (err) {
    updateStoreStatus.run('failed', null, null, `Deletion failed: ${err.message}`, store.id);
    audit(store.id, 'delete_failed', { error: err.message }, 'system');
  }
}

export async function getAuditLog(limit = 50) {
  return getAuditLogs.all(limit);
}

export async function getMetrics() {
  const statusCounts = countByStatus.all();
  const total = countTotal.get();
  const failed = countFailed.get();
  const avgDuration = avgProvisionDuration.get();

  return {
    total_stores: total.count,
    stores_by_status: Object.fromEntries(statusCounts.map((r) => [r.status, r.count])),
    total_failures: failed.count,
    avg_provision_duration_seconds: avgDuration.avg_seconds ? Math.round(avgDuration.avg_seconds) : null,
    active_provisions: activeProvisions,
    queued_provisions: provisionQueue.length,
    max_concurrent_provisions: MAX_CONCURRENT_PROVISIONS,
    max_stores: MAX_STORES,
  };
}
