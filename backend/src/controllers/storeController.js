import { Router } from 'express';
import { validateStoreInput } from '../utils/nameValidator.js';
import * as storeService from '../services/storeService.js';
import { createStoreLimiter } from '../middleware/rateLimiter.js';
import logger from '../utils/logger.js';

const router = Router();

// POST /api/stores - Create a new store
router.post('/', createStoreLimiter, async (req, res, next) => {
  try {
    const { error, value } = validateStoreInput(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map((d) => d.message),
      });
    }

    const store = await storeService.createStore(value, req.ip);
    res.status(201).json(store);
  } catch (err) {
    next(err);
  }
});

// GET /api/stores - List all stores
router.get('/', async (_req, res, next) => {
  try {
    const stores = await storeService.listStores();
    res.json(stores);
  } catch (err) {
    next(err);
  }
});

// GET /api/stores/:id - Get store detail
router.get('/:id', async (req, res, next) => {
  try {
    const store = await storeService.getStore(req.params.id);
    res.json(store);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/stores/:id - Delete a store
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await storeService.deleteStore(req.params.id, req.ip);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/audit-log - Get audit log
router.get('/audit/log', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const logs = await storeService.getAuditLog(limit);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

export default router;
