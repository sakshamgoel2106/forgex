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
import { VisualIntelligenceEngine } from './services/visualIntelligenceEngine.js';

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
  visionProvider?: IVisionProcessingProvider;
  visualEngine?: VisualIntelligenceEngine;
}

export function createApp(deps: AppDependencies = {}): express.Application {
  const app = express();

  const authAdapter = deps.authAdapter ?? createAuthAdapter(config);
  const dataStore = deps.dataStore ?? new InMemoryDataStore();
  const storageAdapter = deps.storageAdapter ?? createStorageAdapter();
  const embeddingAdapter = deps.embeddingAdapter ?? createEmbeddingAdapter();
  const vectorStore = deps.vectorStore ?? createVectorStoreAdapter();
  const ingestionQueue =
    deps.ingestionQueue ??
    new IngestionQueue(dataStore, storageAdapter, embeddingAdapter, vectorStore);

  const generationProvider = deps.generationProvider ?? createGenerationProvider();
  const rerankingProvider = deps.rerankingProvider ?? createRerankingProvider();
  const ragEngine =
    deps.ragEngine ??
    new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider
    );

  const visionProvider = deps.visionProvider ?? createVisionProvider();
  const visualEngine =
    deps.visualEngine ??
    new VisualIntelligenceEngine(dataStore, storageAdapter, visionProvider, ragEngine);

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
  app.use(
    '/api/v1/documents',
    authenticate,
    createDocumentRouter(dataStore, storageAdapter, ingestionQueue)
  );
  app.use('/api/v1/copilot', authenticate, createCopilotRouter(dataStore, ragEngine));
  app.use(
    '/api/v1/visual',
    authenticate,
    createVisualRouter(dataStore, storageAdapter, visualEngine)
  );

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
