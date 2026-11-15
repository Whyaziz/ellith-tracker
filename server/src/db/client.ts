import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from '../config.js';
import * as schema from './schema.js';

// Initialize better-sqlite3 connection
export const sqlite = new Database(config.paths.dbPath);

// Active WAL (Write-Ahead Logging) mode, concurrency timeout, and performance tuning
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('cache_size = -64000'); // 64MB cache in RAM
sqlite.pragma('temp_store = MEMORY');

// Export drizzle db instance with schema
export const db = drizzle(sqlite, { schema });
