import { execFile } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const HELM_TIMEOUT = '600s';

export class HelmClient {
  constructor(chartPath) {
    this.chartPath = chartPath || process.env.HELM_CHART_PATH || '../helm/woocommerce-store';
  }

  async install(releaseName, namespace, values = {}) {
    const args = [
      'install',
      releaseName,
      this.chartPath,
      '--namespace', namespace,
      '--create-namespace',
      '--timeout', HELM_TIMEOUT,
      '--wait=false', // Don't wait - we poll ourselves
    ];

    for (const [key, val] of Object.entries(values)) {
      args.push('--set', `${key}=${val}`);
    }

    logger.info({ releaseName, namespace }, 'Helm install starting');
    return this._exec(args);
  }

  async uninstall(releaseName, namespace) {
    const args = [
      'uninstall',
      releaseName,
      '--namespace', namespace,
      '--timeout', HELM_TIMEOUT,
    ];

    logger.info({ releaseName, namespace }, 'Helm uninstall starting');
    return this._exec(args);
  }

  async status(releaseName, namespace) {
    const args = [
      'status',
      releaseName,
      '--namespace', namespace,
      '--output', 'json',
    ];

    const result = await this._exec(args);
    try {
      return JSON.parse(result.stdout);
    } catch {
      return { info: { status: 'unknown' } };
    }
  }

  async _exec(args) {
    try {
      const { stdout, stderr } = await execFileAsync('helm', args, {
        timeout: 660_000, // 11 minutes
        env: { ...process.env },
      });
      if (stderr) {
        logger.warn({ stderr: stderr.trim() }, 'Helm stderr');
      }
      return { stdout, stderr };
    } catch (err) {
      logger.error({ err: err.message, stderr: err.stderr }, 'Helm command failed');
      throw new Error(`Helm error: ${err.stderr || err.message}`);
    }
  }
}

export default new HelmClient();
