import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

interface TenantUsageRecord {
  monthKey: string;
  queriesCount: number;
  storageBytes: number;
}

export class RateLimiterService {
  private static ipLimits = new Map<string, RateLimitRecord>();
  private static tenantAiLimits = new Map<string, RateLimitRecord>();
  private static tenantMonthlyUsage = new Map<string, TenantUsageRecord>();

  public static reset(): void {
    this.ipLimits.clear();
    this.tenantAiLimits.clear();
    this.tenantMonthlyUsage.clear();
  }

  public static getMonthlyUsage(orgId: string): TenantUsageRecord {
    const currentMonthKey = new Date().toISOString().substring(0, 7); // YYYY-MM
    const existing = this.tenantMonthlyUsage.get(orgId);
    if (existing && existing.monthKey === currentMonthKey) {
      return existing;
    }
    const record: TenantUsageRecord = {
      monthKey: currentMonthKey,
      queriesCount: 0,
      storageBytes: 0,
    };
    this.tenantMonthlyUsage.set(orgId, record);
    return record;
  }

  public static recordAiQuery(orgId: string): void {
    const usage = this.getMonthlyUsage(orgId);
    usage.queriesCount += 1;
  }

  public static recordStorageUsage(orgId: string, bytes: number): void {
    const usage = this.getMonthlyUsage(orgId);
    usage.storageBytes += bytes;
  }

  /**
   * General API rate limiter (Per IP / Client)
   */
  public static generalLimiter() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // In test mode, allow tests to bypass unless explicitly testing rate limits
      if (req.headers['x-skip-rate-limit'] === 'true') {
        return next();
      }

      const clientKey = req.ip || req.socket.remoteAddress || 'unknown-client';
      const now = Date.now();
      const windowMs = 60 * 1000;
      const limit = config.RATE_LIMIT_MAX_PER_MINUTE;

      let record = RateLimiterService.ipLimits.get(clientKey);
      if (!record || now > record.resetAt) {
        record = { count: 1, resetAt: now + windowMs };
        RateLimiterService.ipLimits.set(clientKey, record);
      } else {
        record.count += 1;
      }

      const remaining = Math.max(0, limit - record.count);
      const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

      res.setHeader('X-RateLimit-Limit', limit.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', resetSeconds.toString());

      if (record.count > limit) {
        logger.warn({ clientKey, count: record.count, limit }, 'Rate limit exceeded');
        res.setHeader('Retry-After', resetSeconds.toString());
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests. Limit is ${limit} requests per minute. Please retry in ${resetSeconds} seconds.`,
          },
          requestId: (req as any).id || 'req-rate-limit',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      next();
    };
  }

  /**
   * AI Inference & Heavy Resource Limiter (Per Tenant Organization)
   */
  public static aiInferenceLimiter() {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (req.headers['x-skip-rate-limit'] === 'true') {
        return next();
      }

      const orgId =
        req.auth?.organization?.id || (req as any).user?.organizationId || req.ip || 'global-tenant';
      const now = Date.now();
      const windowMs = 60 * 1000;
      const limit = config.RATE_LIMIT_AI_PER_MINUTE;

      // 1. Check burst rate limit (requests per minute)
      let record = RateLimiterService.tenantAiLimits.get(orgId);
      if (!record || now > record.resetAt) {
        record = { count: 1, resetAt: now + windowMs };
        RateLimiterService.tenantAiLimits.set(orgId, record);
      } else {
        record.count += 1;
      }

      const remaining = Math.max(0, limit - record.count);
      const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

      res.setHeader('X-Tenant-Ai-Limit', limit.toString());
      res.setHeader('X-Tenant-Ai-Remaining', remaining.toString());

      if (record.count > limit) {
        logger.warn({ orgId, count: record.count, limit }, 'Tenant AI rate limit exceeded');
        res.setHeader('Retry-After', resetSeconds.toString());
        res.status(429).json({
          success: false,
          error: {
            code: 'TENANT_AI_RATE_LIMIT_EXCEEDED',
            message: `Tenant AI burst rate limit exceeded (${limit} calls/min). Please retry in ${resetSeconds} seconds.`,
          },
          requestId: (req as any).id || 'req-ai-limit',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 2. Check Monthly Tenant Quota
      const monthlyUsage = RateLimiterService.getMonthlyUsage(orgId);
      if (monthlyUsage.queriesCount >= config.TENANT_QUOTA_QUERIES_MONTHLY) {
        logger.warn(
          { orgId, used: monthlyUsage.queriesCount, max: config.TENANT_QUOTA_QUERIES_MONTHLY },
          'Monthly tenant AI quota exceeded'
        );
        res.status(429).json({
          success: false,
          error: {
            code: 'TENANT_MONTHLY_QUOTA_EXCEEDED',
            message: `Organization monthly AI query limit (${config.TENANT_QUOTA_QUERIES_MONTHLY} queries) reached. Please contact enterprise support for quota expansion.`,
          },
          requestId: (req as any).id || 'req-quota-limit',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Increment usage upon completion of query
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          RateLimiterService.recordAiQuery(orgId);
        }
      });

      next();
    };
  }
}
