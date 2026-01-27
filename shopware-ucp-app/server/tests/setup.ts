/**
 * Jest Test Setup
 */

import { jest } from '@jest/globals';

// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['APP_SECRET'] = 'test-app-secret-for-unit-testing-only';
process.env['UCP_SERVER_URL'] = 'http://localhost:3000';
process.env['UCP_VERSION'] = '2026-01-11';

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    checkoutSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    shop: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    signingKey: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    platformProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    webhookDelivery: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }] as never),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Global test timeout
jest.setTimeout(10000);
