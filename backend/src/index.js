import express from 'express';
import cors from 'cors';
import './database/db.js';
import storeController from './controllers/storeController.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import * as storeService from './services/storeService.js';
import logger from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (nginx) so req.ip uses X-Forwarded-For
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api', apiLimiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Metrics endpoint (observability)
app.get('/api/metrics', async (_req, res, next) => {
  try {
    const metrics = await storeService.getMetrics();
    res.json(metrics);
  } catch (err) {
    next(err);
  }
});

// Routes
app.use('/api/stores', storeController);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Store Platform Backend started');
});
