import path from 'node:path';
import fs from 'node:fs';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { config } from '../config.js';

const logFilePath = path.join(config.paths.logsDir, 'app.log');
const logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const streams: pino.StreamEntry[] = [
  { stream: process.stdout },
  { stream: logFileStream },
];

export const logger = pino(
  {
    level: config.isProduction ? 'info' : 'debug',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream(streams)
);

export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    // Avoid cluttering logs with frequent health check polls
    ignore: (req) => req.url === '/api/health',
  },
});
