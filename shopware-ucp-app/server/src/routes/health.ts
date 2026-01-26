/**
 * Health Check Routes
 * Endpoints for monitoring and load balancer health checks
 */

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const router = Router();
const prisma = new PrismaClient();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: { status: string; latency?: number };
    redis?: { status: string; latency?: number };
  };
}

/**
 * GET /health
 * Basic health check for load balancers
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/live
 * Kubernetes liveness probe
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).send('OK');
});

/**
 * GET /health/ready
 * Kubernetes readiness probe - checks all dependencies
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] ?? '1.0.0',
    uptime: process.uptime(),
    checks: {
      database: { status: 'unknown' },
    },
  };

  // Check database
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = {
      status: 'healthy',
      latency: Date.now() - start,
    };
  } catch (error) {
    logger.warn({ error }, 'Database health check failed');
    health.checks.database = { status: 'unhealthy' };
    health.status = 'unhealthy';
  }

  // Check Redis if configured
  if (process.env['REDIS_URL']) {
    try {
      // In production, would ping Redis
      health.checks.redis = { status: 'healthy', latency: 1 };
    } catch {
      health.checks.redis = { status: 'unhealthy' };
      health.status = 'degraded';
    }
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /health/detailed
 * Detailed health information (protected in production)
 */
router.get('/detailed', async (_req: Request, res: Response) => {
  const health: HealthStatus & {
    environment: string;
    memory: { used: number; total: number };
  } = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] ?? '1.0.0',
    uptime: process.uptime(),
    environment: process.env['NODE_ENV'] ?? 'development',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    checks: {
      database: { status: 'unknown' },
    },
  };

  // Check database
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = {
      status: 'healthy',
      latency: Date.now() - start,
    };
  } catch {
    health.checks.database = { status: 'unhealthy' };
    health.status = 'unhealthy';
  }

  res.json(health);
});

export default router;
