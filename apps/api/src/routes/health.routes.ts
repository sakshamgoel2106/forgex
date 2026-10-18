import { Router } from 'express';
import { HealthController } from '../controllers/health.controller.js';

export const healthRouter = Router();

// Standard container probes
healthRouter.get('/healthz', HealthController.getLiveness);
healthRouter.get('/livez', HealthController.getLiveness);
healthRouter.get('/readyz', HealthController.getReadiness);

// Detailed enterprise diagnostic health endpoint
healthRouter.get('/api/v1/health', HealthController.getDetailedHealth);
