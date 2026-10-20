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
import { createGuidanceRouter } from './routes/guidance.routes.js';
import { MachineRecoveryService } from './services/machineRecovery.service.js';
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
  speechProvider?: ISpeechToTextProvider & ITextToSpeechProvider;
}

export function createApp(deps: AppDependencies = {}): express.Application {
  const app = express();

  const authAdapter = deps.authAdapter ?? createAuthAdapter(config);
  const dataStore = deps.dataStore ?? new InMemoryDataStore();
  const securityService = deps.securityService ?? new SecurityEventService(dataStore);
  app.locals.securityService = securityService;
  app.locals.dataStore = dataStore;

  const storageAdapter = deps.storageAdapter ?? createStorageAdapter();
  const embeddingAdapter = deps.embeddingAdapter ?? createEmbeddingAdapter();
  const vectorStore = deps.vectorStore ?? createVectorStoreAdapter();
  const visionProvider = deps.visionProvider ?? createVisionProvider();
  const ingestionQueue =
    deps.ingestionQueue ??
    new IngestionQueue(dataStore, storageAdapter, embeddingAdapter, vectorStore, visionProvider);

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

  // Security hardening
  app.use(helmet());
  const allowedOrigins = config.CORS_ORIGIN.includes(',')
    ? config.CORS_ORIGIN.split(',').map((s) => s.trim())
    : config.CORS_ORIGIN;
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
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

  // Health and readiness endpoints (Public, unthrottled for cluster orchestrators)
  app.use(healthRouter);

  // General API rate limiter
  app.use(RateLimiterService.generalLimiter());

  const aiLimiter = RateLimiterService.aiInferenceLimiter();

  // Auth and Onboarding Routes (Public & Semi-public endpoints)
  app.use('/api/v1/auth', createAuthRouter(dataStore, authAdapter));

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
    createVisualRouter(dataStore, storageAdapter, visualEngine)
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
  app.use('/api/v1/specialists', authenticate, createSpecialistDirectoryRouter(dataStore));
  app.use('/api/v1/machines', authenticate, createMachineSpecialistRouter(dataStore));
  app.use('/api/v1/machines', authenticate, createMachineRouter(dataStore));
  app.use('/api/v1/machines', authenticate, createMappingRouter(dataStore));
  app.use('/api/v1/knowledge', authenticate, createPublicKnowledgeRouter(dataStore));
  app.use('/api/v1/tasks', authenticate, createTaskRouter(dataStore));
  app.use('/api/v1/badges', authenticate, createBadgeRouter(dataStore));
  app.use('/api/v1/engineering', authenticate, createEngineeringRouter(dataStore, storageAdapter));
  app.use('/api/v1/maintenance-records', authenticate, createMaintenanceRecordRouter(dataStore));
  app.use('/api/v1/recovery', authenticate, createRecoveryRouter(dataStore, recoveryService, storageAdapter));
  app.use('/api/v1/guidance', authenticate, createGuidanceRouter(dataStore));



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
