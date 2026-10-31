import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config, getAllowedOriginsList } from './config/env.js';
import { getDeploymentConfig, getPublicDeploymentConfig } from './config/deployment.js';
import { logger } from './utils/logger.js';
import { createHealthRouter } from './routes/health.routes.js';
import type { IAuthAdapter } from './auth/authAdapter.interface.js';
import { createAuthAdapter } from './auth/authAdapterFactory.js';
import type { IDataStore } from './db/dataStore.interface.js';
import { InMemoryDataStore } from './db/inMemoryDataStore.js';
import { createAuthMiddleware } from './middleware/auth.middleware.js';
import { createPlantRouter } from './routes/plant.routes.js';
import { createAssetRouter } from './routes/asset.routes.js';
import { createAuditRouter } from './routes/audit.routes.js';
import { createDocumentRouter } from './routes/document.routes.js';
import { createCopilotRouter } from './routes/copilot.routes.js';
import { createVisualRouter } from './routes/visual.routes.js';
import { createMaintenanceRouter } from './routes/maintenance.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createOrgRouter } from './routes/org.routes.js';
import { createMachineRouter } from './routes/machine.routes.js';
import { createPublicKnowledgeRouter } from './routes/publicKnowledge.routes.js';
import { createTaskRouter } from './routes/task.routes.js';
import { createMappingRouter } from './routes/mapping.routes.js';
import { createBadgeRouter } from './routes/badge.routes.js';
import { createEngineeringRouter } from './routes/engineering.routes.js';
import { createMaintenanceRecordRouter } from './routes/maintenanceHistory.routes.js';
import { createRecoveryRouter } from './routes/recovery.routes.js';
import { MachineRecoveryService } from './services/machineRecovery.service.js';
import { createRcaRouter } from './routes/rca.routes.js';
import { RcaService } from './services/rca.service.js';
import {
  createEmployeeRouter,
  createTicketRouter,
  createSpecialistDirectoryRouter,
  createMachineSpecialistRouter,
} from './routes/specialist.routes.js';
import type { IStorageAdapter } from './storage/storage.interface.js';
import { createStorageAdapter } from './storage/storageFactory.js';
import type { IEmbeddingAdapter } from './embeddings/embeddings.interface.js';
import { createEmbeddingAdapter } from './embeddings/embeddingFactory.js';
import type { IVectorStoreAdapter } from './vector/vectorStore.interface.js';
import { createVectorStoreAdapter } from './vector/vectorStoreFactory.js';
import { IngestionQueue } from './jobs/ingestionQueue.js';
import { OutboxRelayWorker } from './jobs/outboxRelay.js';
import type { IMultimodalGenerationProvider, IRerankingProvider } from './ai/ai.interface.js';
import { createGenerationProvider, createRerankingProvider } from './ai/aiProviderFactory.js';
import type { IVisionProcessingProvider } from './ai/vision.interface.js';
import { createVisionProvider } from './ai/visionProviderFactory.js';
import { RAGQueryEngine } from './services/ragQueryEngine.js';
import { SecurityEventService } from './services/securityEvent.service.js';
import { VisualIntelligenceEngine } from './services/visualIntelligenceEngine.js';
import { MaintenanceWorkflowEngine } from './services/maintenanceWorkflowEngine.js';
import { RateLimiterService } from './middleware/rateLimiter.middleware.js';
import { MetricsService } from './services/metrics.service.js';
import type { ISpeechToTextProvider, ITextToSpeechProvider } from './speech/speech.interface.js';
import { LocalDevSpeechAdapter } from './speech/localDevSpeechAdapter.js';

export interface AppDependencies {
  authAdapter?: IAuthAdapter;
  dataStore?: IDataStore;
  storageAdapter?: IStorageAdapter;
  embeddingAdapter?: IEmbeddingAdapter;
  vectorStore?: IVectorStoreAdapter;
  ingestionQueue?: IngestionQueue;
  generationProvider?: IMultimodalGenerationProvider;
  rerankingProvider?: IRerankingProvider;
  ragEngine?: RAGQueryEngine;
  securityService?: SecurityEventService;
  visionProvider?: IVisionProcessingProvider;
  visualEngine?: VisualIntelligenceEngine;
  maintenanceEngine?: MaintenanceWorkflowEngine;
  recoveryService?: MachineRecoveryService;
  rcaService?: RcaService;
  speechProvider?: ISpeechToTextProvider & ITextToSpeechProvider;
}

import { installGlobalOutboundGuard } from './utils/outboundGuard.js';

export function createApp(deps: AppDependencies = {}): express.Application {
  installGlobalOutboundGuard();
  const app = express();

  const authAdapter = deps.authAdapter ?? createAuthAdapter(config);
  const dataStore = deps.dataStore ?? new InMemoryDataStore();
  const securityService = deps.securityService ?? new SecurityEventService(dataStore);
  app.locals.securityService = securityService;
  app.locals.dataStore = dataStore;

  const storageAdapter = deps.storageAdapter ?? createStorageAdapter();
  const embeddingAdapter = deps.embeddingAdapter ?? createEmbeddingAdapter();
  const vectorStore = deps.vectorStore ?? createVectorStoreAdapter();
  app.locals.storageAdapter = storageAdapter;
  app.locals.embeddingAdapter = embeddingAdapter;
  app.locals.vectorStore = vectorStore;
  const visionProvider = deps.visionProvider ?? createVisionProvider();
  const ingestionQueue =
    deps.ingestionQueue ??
    new IngestionQueue(dataStore, storageAdapter, embeddingAdapter, vectorStore, visionProvider);

  const outboxRelay = new OutboxRelayWorker(dataStore, ingestionQueue);
  outboxRelay.start();
  app.locals.outboxRelay = outboxRelay;

  const generationProvider = deps.generationProvider ?? createGenerationProvider();
  const rerankingProvider = deps.rerankingProvider ?? createRerankingProvider();
  const ragEngine =
    deps.ragEngine ??
    new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider,
      process.env.QDRANT_COLLECTION || 'forgex_knowledge',
      securityService
    );

  const visualEngine =
    deps.visualEngine ??
    new VisualIntelligenceEngine(dataStore, storageAdapter, visionProvider, ragEngine);

  const maintenanceEngine =
    deps.maintenanceEngine ??
    new MaintenanceWorkflowEngine(dataStore, ragEngine, visualEngine);

  const recoveryService =
    deps.recoveryService ??
    new MachineRecoveryService(dataStore, securityService);

  const rcaService =
    deps.rcaService ??
    new RcaService(dataStore, embeddingAdapter, vectorStore, generationProvider);

  const speechDeploymentMode =
    config.DEPLOYMENT_MODE === 'enterprise'
      ? 'ENTERPRISE_OLLAMA'
      : config.DEPLOYMENT_MODE === 'saas'
      ? 'SAAS_CLOUD'
      : 'LOCAL_DEV';

  const speechProvider =
    deps.speechProvider ??
    new LocalDevSpeechAdapter(speechDeploymentMode);

  const authenticate = createAuthMiddleware(authAdapter, dataStore);

  const isDev = config.NODE_ENV !== 'production';
  const deployment = getDeploymentConfig();
  const isEnterprise = deployment.mode === 'enterprise' || !deployment.allowExternalNetwork;

  // Requirement 4: Strict Content-Security-Policy via helmet
  // Enterprise mode: connect-src 'self' + configured internal hosts only; zero third-party script-src.
  // SaaS mode: allows Google domains for GIS and APIs.
  const buildCsp = () => {
    if (isEnterprise) {
      const internalOrigins = new Set<string>([
        "'self'",
        'blob:',
        'data:',
        'ws:',
        'wss:',
      ]);

      const envUrls = [
        process.env.OLLAMA_BASE_URL,
        process.env.QDRANT_URL,
        process.env.S3_ENDPOINT,
        process.env.MINIO_ENDPOINT,
        process.env.DATABASE_URL,
        process.env.WORKER_URL,
        process.env.OPENAI_BASE_URL,
        process.env.ENTERPRISE_HOST_ALLOWLIST,
      ];

      for (const urlStr of envUrls) {
        if (!urlStr) continue;
        const parts = urlStr.split(',');
        for (const p of parts) {
          const trimmed = p.trim();
          if (!trimmed) continue;
          try {
            const parsed = new URL(trimmed);
            internalOrigins.add(parsed.origin);
          } catch {
            internalOrigins.add(trimmed);
          }
        }
      }

      if (isDev) {
        internalOrigins.add('http://localhost:*');
        internalOrigins.add('http://127.0.0.1:*');
        internalOrigins.add('ws://localhost:*');
        internalOrigins.add('ws://127.0.0.1:*');
      }

      return {
        directives: {
          defaultSrc: ["'self'"],
          // Strict: Zero third-party scripts. Self-hosted only.
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'wasm-unsafe-eval'",
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: Array.from(internalOrigins),
          workerSrc: ["'self'", 'blob:'],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      };
    }

    // SaaS Cloud Mode with Google Workspace integration
    return {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://accounts.google.com',
          'https://apis.google.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://*.googleusercontent.com',
          'https://accounts.google.com',
        ],
        fontSrc: ["'self'", 'data:'],
        connectSrc: [
          "'self'",
          'blob:',
          'data:',
          'ws:',
          'wss:',
          'https://accounts.google.com',
          'https://www.googleapis.com',
          'https://generativelanguage.googleapis.com',
        ],
        frameSrc: ["'self'", 'https://accounts.google.com'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    };
  };

  app.use(
    helmet({
      crossOriginResourcePolicy: isDev ? false : undefined,
      contentSecurityPolicy: buildCsp(),
    })
  );

  const allowedOrigins = getAllowedOriginsList(config);
  app.use(
    cors({
      origin: isDev
        ? (_origin, callback) => {
            // In dev mode, allow requests from any origin (e.g. tunnels, mobile test devices, localhost)
            callback(null, true);
          }
        : (requestOrigin, callback) => {
            if (!requestOrigin) return callback(null, true);
            if (allowedOrigins.includes(requestOrigin) || allowedOrigins.includes('*')) {
              return callback(null, true);
            }
            callback(null, false);
          },
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-organization-id',
        'x-plant-id',
        'Accept',
        'Cache-Control',
        'X-Requested-With',
      ],
      exposedHeaders: ['Content-Range', 'X-Content-Range'],
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request tracing, access log & sanitized metric counting
  app.use((req, res, next) => {
    const start = Date.now();
    MetricsService.incrementRequest();
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        MetricsService.incrementError();
      }
      logger.info(
        {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
          ip: req.ip,
        },
        'HTTP request handled'
      );
    });
    next();
  });

  // Health, readiness, and authenticated dependencies endpoints
  app.use(createHealthRouter(authenticate));

  // Public, unauthenticated Runtime Configuration endpoint (safe fields only, zero secrets)
  const publicConfigHandler = (_req: express.Request, res: express.Response) => {
    const pubConfig = getPublicDeploymentConfig();
    res.json({
      success: true,
      data: pubConfig,
      ...pubConfig,
    });
  };
  app.get('/api/config/public', publicConfigHandler);
  app.get('/api/v1/config/public', publicConfigHandler);

  // In Enterprise mode, auto-resolve x-organization-id to the single tenant if missing
  app.use(async (req, _res, next) => {
    if (deployment.mode === 'enterprise' && !req.headers['x-organization-id']) {
      try {
        let tenantId = deployment.singleTenantOrgId;
        if (!tenantId && (dataStore as any).listOrganizations) {
          const orgs = await (dataStore as any).listOrganizations();
          if (orgs.length > 0) {
            tenantId = orgs[0].id;
          }
        }
        if (tenantId) {
          req.headers['x-organization-id'] = tenantId;
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to auto-resolve single-tenant organization in enterprise mode');
      }
    }
    next();
  });

  // General API rate limiter
  app.use(RateLimiterService.generalLimiter());

  const aiLimiter = RateLimiterService.aiInferenceLimiter();

  // Auth and Onboarding Routes (Public & Semi-public endpoints)
  const authRouter = createAuthRouter(dataStore, authAdapter);
  app.use('/api/v1/auth', authRouter);

  // Industrial Badge Login alias (unauthenticated shop-floor terminal endpoint)
  app.post('/api/v1/badges/login', (req, res, next) => {
    req.url = '/badge-login';
    authRouter(req, res, next);
  });

  // Protected Organization & Team Management Routes
  app.use('/api/v1/org', authenticate, createOrgRouter(dataStore));

  // Protected Domain Routes
  app.use('/api/v1/plants', authenticate, createPlantRouter(dataStore));
  app.use('/api/v1/assets', authenticate, createAssetRouter(dataStore));
  app.use('/api/v1/audit', authenticate, createAuditRouter(dataStore, securityService));
  app.use(
    '/api/v1/documents',
    authenticate,
    createDocumentRouter(dataStore, storageAdapter, ingestionQueue, vectorStore)
  );
  app.use(
    '/api/v1/copilot',
    authenticate,
    aiLimiter,
    createCopilotRouter(dataStore, ragEngine, speechProvider)
  );
  app.use(
    '/api/v1/visual',
    authenticate,
    aiLimiter,
    createVisualRouter(
      dataStore,
      storageAdapter,
      visualEngine,
      embeddingAdapter,
      vectorStore,
      visionProvider,
      securityService
    )
  );
  app.use(
    '/api/v1/maintenance',
    authenticate,
    aiLimiter,
    createMaintenanceRouter(dataStore, maintenanceEngine)
  );

  // Phase B Industrial Machine Registry, Tasks, Mappings, Knowledge, Specialist Routing & Badges
  app.use('/api/v1/employees', authenticate, createEmployeeRouter(dataStore));
  app.use('/api/v1/tickets', authenticate, createTicketRouter(dataStore));
  app.use('/api/tickets', authenticate, createTicketRouter(dataStore));
  app.use('/api/v1/specialists', authenticate, createSpecialistDirectoryRouter(dataStore));
  app.use('/api/v1/machines', authenticate, createMachineSpecialistRouter(dataStore));
  app.use('/api/v1/machines', authenticate, createMachineRouter(dataStore));
  app.use('/api/v1/machines', authenticate, createMappingRouter(dataStore));
  app.use('/api/v1/knowledge', authenticate, createPublicKnowledgeRouter(dataStore));
  app.use('/api/v1/tasks', authenticate, createTaskRouter(dataStore));
  app.use('/api/v1/badges', authenticate, createBadgeRouter(dataStore));
  app.use('/api/v1/engineering', authenticate, createEngineeringRouter(dataStore, storageAdapter, ingestionQueue, vectorStore));
  app.use('/api/v1/maintenance-records', authenticate, createMaintenanceRecordRouter(dataStore));
  app.use('/api/v1/recovery', authenticate, createRecoveryRouter(dataStore, recoveryService, storageAdapter, embeddingAdapter, vectorStore));
  const rcaRouter = createRcaRouter(dataStore, embeddingAdapter, vectorStore, generationProvider, rcaService);
  app.use('/api/v1/rca', authenticate, rcaRouter);
  app.use('/api/rca', authenticate, rcaRouter);



  // Requirement 5: Serve the built web app from the API (express.static + SPA fallback) when SERVE_WEB=true
  const shouldServeWeb = config.SERVE_WEB || process.env.SERVE_WEB === 'true';
  if (shouldServeWeb) {
    const candidatePaths = [
      config.WEB_DIST_PATH,
      process.env.WEB_DIST_PATH,
      path.resolve(process.cwd(), 'apps/web/dist'),
      path.resolve(process.cwd(), '../web/dist'),
      path.resolve(process.cwd(), 'web/dist'),
      path.resolve(process.cwd(), 'dist/web'),
    ].filter(Boolean) as string[];

    const resolvedWebDist = candidatePaths.find((p) => {
      try {
        return fs.existsSync(path.join(p, 'index.html'));
      } catch {
        return false;
      }
    });

    if (resolvedWebDist) {
      logger.info({ webDist: resolvedWebDist }, 'Serving ForgeX Web UI from API origin (SERVE_WEB=true)');

      // Serve static assets with caching headers
      app.use(
        express.static(resolvedWebDist, {
          maxAge: '1d',
          index: false,
        })
      );

      // SPA fallback for all non-API GET requests
      app.get('*', (req, res, next) => {
        if (
          req.path.startsWith('/api') ||
          req.path.startsWith('/health') ||
          req.path.startsWith('/ready') ||
          req.path.startsWith('/metrics')
        ) {
          return next();
        }
        res.sendFile(path.join(resolvedWebDist, 'index.html'));
      });
    } else {
      logger.warn(
        { candidatePaths },
        'SERVE_WEB=true was requested, but web dist directory with index.html could not be located. Run `npm run build` in apps/web.'
      );
    }
  }

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
