import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'erp-test-'));
process.env.DATA_DIR = directory;
const { runMigrations } = await import('../server/src/db/migrate.js');
runMigrations();
const { sqlite } = await import('../server/src/db/client.js');
afterAll(() => {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});
