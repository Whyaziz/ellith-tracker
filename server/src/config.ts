import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory or project root
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATA_DIR: z.string().optional(),
  SESSION_SECRET: z.string().min(16).default('dev-resi-tracker-session-secret-key-32chars'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

const rawEnv = parsed.data;

// Resolve DATA_DIR
const defaultDataDir = path.resolve(__dirname, '../../data');
const dataDir = rawEnv.DATA_DIR ? path.resolve(rawEnv.DATA_DIR) : defaultDataDir;

const logsDir = path.join(dataDir, 'logs');
const pdfDir = path.join(dataDir, 'pdf');
const backupDir = path.join(dataDir, 'backup');
const uploadsDir = path.join(dataDir, 'uploads');
const productsDir = path.join(uploadsDir, 'products');
const customersDir = path.join(uploadsDir, 'customers');
const dbPath = path.join(dataDir, 'app.db');

// Ensure required runtime directories exist
for (const dir of [dataDir, logsDir, pdfDir, backupDir, uploadsDir, productsDir, customersDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const config = {
  nodeEnv: rawEnv.NODE_ENV,
  isProduction: rawEnv.NODE_ENV === 'production',
  port: rawEnv.PORT,
  sessionSecret: rawEnv.SESSION_SECRET,
  paths: {
    dataDir,
    logsDir,
    pdfDir,
    backupDir,
    uploadsDir,
    productsDir,
    customersDir,
    dbPath,
    migrationsDir: path.resolve(__dirname, '../drizzle'),
    publicDir: path.resolve(__dirname, '../public'),
  },
};
