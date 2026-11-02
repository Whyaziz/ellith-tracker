import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import { config } from './config.js';
import { logger, httpLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';
import { sqlite } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { BetterSqlite3SessionStore } from './session/sqliteStore.js';

// Auto-run database migrations on startup
runMigrations();

const app = express();

// Trust reverse proxies if running in production LAN setup
app.set('trust proxy', 1);

// HTTP request logging
app.use(httpLogger);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session handling with SQLite storage
app.use(
  session({
    store: new BetterSqlite3SessionStore(sqlite),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // Allows local LAN access over HTTP
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days session lifetime
    },
  })
);

// Mount API router
app.use('/api', apiRouter);

// Serve static frontend assets if built and present in server/public
if (fs.existsSync(config.paths.publicDir)) {
  app.use(express.static(config.paths.publicDir));

  // SPA fallback for frontend client-side routing
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    const indexPath = path.join(config.paths.publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
}

// Global error handler
app.use(errorHandler);

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(`Server Resi-Tracker berjalan di http://localhost:${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Database path: ${config.paths.dbPath}`);
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down server gracefully...`);
  server.close(() => {
    try {
      sqlite.close();
      logger.info('Database connection closed.');
    } catch (err) {
      logger.error({ err }, 'Error closing SQLite database:');
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default app;
