import type { Request, Response } from 'express';
import { HealthService } from '../services/health.service.js';

export class HealthController {
  public static async getDetailedHealth(_req: Request, res: Response): Promise<void> {
    const health = await HealthService.getDetailedHealth();
    const httpStatus = health.status === 'HEALTHY' ? 200 : 503;
    res.status(httpStatus).json(health);
  }

  public static getLiveness(_req: Request, res: Response): void {
    const isAlive = HealthService.isAlive();
    res.status(isAlive ? 200 : 503).json({
      status: isAlive ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
    });
  }

  public static async getReadiness(_req: Request, res: Response): Promise<void> {
    const isReady = await HealthService.isReady();
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'READY' : 'NOT_READY',
      timestamp: new Date().toISOString(),
    });
  }
}
