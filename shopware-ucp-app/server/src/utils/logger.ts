/**
 * Logger utility using Pino
 */

import pino, { type LoggerOptions } from 'pino';

const logLevel = process.env['LOG_LEVEL'] ?? 'info';
const isDevelopment = process.env['NODE_ENV'] === 'development';

const baseOptions: LoggerOptions = {
  level: logLevel,
  base: {
    env: process.env['NODE_ENV'],
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
};

export const logger = isDevelopment
  ? pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
        },
      },
    })
  : pino(baseOptions);

export type Logger = typeof logger;
