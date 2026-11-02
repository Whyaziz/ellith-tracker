import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from '../config.js';
import * as schema from './schema.js';

// Initialize better-sqlite3 connection
export const sqlite = new Database(config.paths.dbPath);

// Active WAL (Write-Ahead Logging) mode and foreign keys enforcement
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Export drizzle db instance with schema
export const db = drizzle(sqlite, { schema });
