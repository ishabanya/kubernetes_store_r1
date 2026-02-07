import logger from '../utils/logger.js';

export class MedusaProvisioner {
  async provision(store) {
    logger.info({ store: store.name }, 'MedusaJS provisioner is not yet implemented');
    throw new Error('MedusaJS provisioning is not yet available. Coming soon!');
  }

  async deprovision(store) {
    logger.info({ store: store.name }, 'MedusaJS deprovisioner is not yet implemented');
    throw new Error('MedusaJS deprovisioning is not yet available.');
  }
}

export default new MedusaProvisioner();
