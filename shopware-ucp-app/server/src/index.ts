/**
 * UCP App Server Entry Point
 * Express.js server for Shopware 6 UCP App
 */

import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger.js';
import { keyManager } from './services/KeyManager.js';
import { metricsMiddleware, metricsHandler } from './middleware/metrics.js';

// Import routes
import shopwareRoutes from './routes/shopware.js';
import ucpProfileRoutes from './routes/ucp-profile.js';
import checkoutSessionsRoutes from './routes/checkout-sessions.js';
import webhooksRoutes from './routes/webhooks.js';
import mcpRoutes from './routes/mcp.js';
import healthRoutes from './routes/health.js';
import adminRoutes from './routes/admin.js';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

// ============================================================================
// Middleware
// ============================================================================

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable for API server
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS
app.use(
  cors({
    origin: process.env['CORS_ORIGINS']?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'UCP-Agent', 'X-Shop-ID'],
  })
);

// Request logging
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req, res) => {
      return `${req.method} ${req.url} - ${res.statusCode}`;
    },
    customErrorMessage: (req, res) => {
      return `${req.method} ${req.url} - ${res.statusCode}`;
    },
  })
);

// Body parsing with raw body for signature validation
app.use(
  express.json({
    verify: (req: Request & { rawBody?: string }, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

// Prometheus metrics collection
if (process.env['ENABLE_METRICS'] !== 'false') {
  app.use(metricsMiddleware());
}

// ============================================================================
// Routes
// ============================================================================

// Health check (before other routes for load balancer)
app.use('/health', healthRoutes);

// Prometheus metrics endpoint
if (process.env['ENABLE_METRICS'] !== 'false') {
  app.get('/metrics', metricsHandler);
}

// Shopware app registration
app.use('/shopware', shopwareRoutes);

// UCP Profile endpoint
app.use('/.well-known/ucp', ucpProfileRoutes);

// UCP API v1
app.use('/api/v1/checkout-sessions', checkoutSessionsRoutes);

// Shopware webhooks (order events)
app.use('/webhooks', webhooksRoutes);

// MCP transport
app.use('/mcp', mcpRoutes);

// Admin API (for configuration UI)
app.use('/api/admin', adminRoutes);

// Admin dashboard HTML (for Shopware iframe)
app.use('/admin', adminRoutes);

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: 'The requested resource was not found',
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');

  res.status(500).json({
    error: 'internal_error',
    message: process.env['NODE_ENV'] === 'production' ? 'Internal server error' : err.message,
  });
});

// ============================================================================
// Server Startup
// ============================================================================

async function startServer(): Promise<void> {
  try {
    // Initialize key manager
    await keyManager.initialize();
    logger.info('Key manager initialized');

    // Start server
    app.listen(PORT, HOST, () => {
      logger.info({ port: PORT, host: HOST }, 'UCP App Server started');
      logger.info(
        { url: `http://${HOST}:${PORT}/.well-known/ucp` },
        'UCP Profile endpoint available'
      );
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();

export { app };
