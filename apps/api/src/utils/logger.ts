import pino from 'pino';
import { config } from '../config/env.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: {
    service: 'forgex-api',
    env: config.NODE_ENV,
    plant: config.PLANT_SITE_CODE,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
