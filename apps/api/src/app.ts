import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { healthRouter } from './routes/health.routes.js';
import type { IAuthAdapter } from './auth/authAdapter.interface.js';
import { createAuthAdapter } from './auth/authAdapterFactory.js';
import type { IDataStore } from './db/dataStore.interface.js';
import { InMemoryDataStore } from './db/inMemoryDataStore.js';
import { createAuthMiddleware } from './middleware/auth.middleware.js';
import { createPlantRouter } from './routes/plant.routes.js';
import { createAssetRouter } from './routes/asset.routes.js';
import { createAuditRouter } from './routes/audit.routes.js';

export interface AppDependencies {
  authAdapter?: IAuthAdapter;
  dataStore?: IDataStore;
}

export function createApp(deps: AppDependencies = {}): express.Application {
  const app = express();

  const authAdapter = deps.authAdapter ?? createAuthAdapter(config);
  const dataStore = deps.dataStore ?? new InMemoryDataStore();
  const authenticate = createAuthMiddleware(authAdapter, dataStore);

  // Security hardening
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request tracing & access log
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
        },
        'HTTP request handled'
      );
    });
    next();
  });

  // Health and readiness endpoints (Public)
  app.use(healthRouter);

  // Protected Domain Routes
  app.use('/api/v1/plants', authenticate, createPlantRouter(dataStore));
  app.use('/api/v1/assets', authenticate, createAssetRouter(dataStore));
  app.use('/api/v1/audit', authenticate, createAuditRouter(dataStore));

  // Global not found handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource does not exist.',
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Global error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error({ err }, 'Unhandled server error');
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected internal error occurred.',
        },
        timestamp: new Date().toISOString(),
      });
    }
  );

  return app;
}
