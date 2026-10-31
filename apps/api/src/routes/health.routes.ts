import { Router, type RequestHandler } from 'express';
import { HealthController } from '../controllers/health.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createHealthRouter(authMiddleware?: RequestHandler): Router {
  const router = Router();

  // Standard container probes
  router.get('/healthz', HealthController.getLiveness);
  router.get('/livez', HealthController.getLiveness);
  router.get('/health/live', HealthController.getLiveness);

  router.get('/readyz', HealthController.getReadiness);
  router.get('/health/ready', HealthController.getReadiness);

  // Detailed enterprise diagnostic health endpoint
  router.get('/api/v1/health', HealthController.getDetailedHealth);

  // Operational metrics endpoint (sanitized, zero document content)
  router.get('/api/v1/metrics', HealthController.getMetrics);
  router.get('/metrics', HealthController.getMetrics);

  // Dependencies status endpoint (Admin only)
  const middlewareChain: RequestHandler[] = [];
  if (authMiddleware) {
    middlewareChain.push(authMiddleware);
  }
  middlewareChain.push(requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']));

  router.get('/api/health/dependencies', ...middlewareChain, HealthController.getDependenciesHealth);
  router.get('/api/v1/health/dependencies', ...middlewareChain, HealthController.getDependenciesHealth);
  router.get('/health/dependencies', ...middlewareChain, HealthController.getDependenciesHealth);

  return router;
}

export const healthRouter = createHealthRouter();
