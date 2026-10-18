import { Router } from 'express';
import { HealthController } from '../controllers/health.controller.js';

export const healthRouter = Router();

// Standard container probes
healthRouter.get('/healthz', HealthController.getLiveness);
healthRouter.get('/livez', HealthController.getLiveness);
healthRouter.get('/health/live', HealthController.getLiveness);

healthRouter.get('/readyz', HealthController.getReadiness);
healthRouter.get('/health/ready', HealthController.getReadiness);

// Detailed enterprise diagnostic health endpoint
healthRouter.get('/api/v1/health', HealthController.getDetailedHealth);

// Operational metrics endpoint (sanitized, zero document content)
healthRouter.get('/api/v1/metrics', HealthController.getMetrics);
healthRouter.get('/metrics', HealthController.getMetrics);
