import crypto from 'crypto';
import helmClient from '../kubernetes/helmClient.js';
import logger from '../utils/logger.js';

function generatePassword(length = 16) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

export class WooCommerceProvisioner {
  constructor() {
    this.baseDomain = process.env.BASE_DOMAIN || '127.0.0.1.nip.io';
    this.storePort = process.env.STORE_PORT || '';
  }

  async provision(store) {
    const releaseName = `wc-${store.name}`;
    const namespace = store.namespace;

    const dbRootPassword = generatePassword();
    const dbPassword = generatePassword();
    const wpAdminUser = store.adminUser || 'admin';
    const wpAdminPassword = store.adminPassword || generatePassword(12);
    const storeDomain = `${store.name}.${this.baseDomain}`;
    const portSuffix = this.storePort ? `:${this.storePort}` : '';

    const values = {
      'storeName': store.name,
      'storeDomain': storeDomain,
      'storePort': this.storePort || '80',
      'mariadb.rootPassword': dbRootPassword,
      'mariadb.password': dbPassword,
      'mariadb.database': 'wordpress',
      'mariadb.user': 'wordpress',
      'wordpress.adminUser': wpAdminUser,
      'wordpress.adminPassword': wpAdminPassword,
      'wordpress.adminEmail': `${wpAdminUser}@${storeDomain}`,
    };

    logger.info({ releaseName, namespace, domain: storeDomain }, 'Provisioning WooCommerce store');

    await helmClient.install(releaseName, namespace, values);

    return {
      storeUrl: `http://${storeDomain}${portSuffix}`,
      adminUrl: `http://${storeDomain}${portSuffix}/wp-admin`,
    };
  }

  async deprovision(store) {
    const slug = store.slug || store.name;
    const releaseName = `wc-${slug}`;
    try {
      await helmClient.uninstall(releaseName, store.namespace);
    } catch (err) {
      logger.warn({ err: err.message }, 'Helm uninstall warning (may already be gone)');
    }

    // Delete namespace to clean up everything
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      await execFileAsync('kubectl', ['delete', 'namespace', store.namespace, '--ignore-not-found']);
    } catch (err) {
      logger.warn({ err: err.message }, 'Namespace cleanup warning');
    }
  }
}

export default new WooCommerceProvisioner();
