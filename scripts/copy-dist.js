import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'web', 'dist');
const destDir = path.join(rootDir, 'server', 'public');

if (!fs.existsSync(srcDir)) {
  console.error(`Error: Source directory "${srcDir}" does not exist. Did you run "npm run build:web"?`);
  process.exit(1);
}

// Ensure destination directory is clean
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

// Copy contents of web/dist to server/public
fs.cpSync(srcDir, destDir, { recursive: true });
console.log(`Successfully copied "${srcDir}" to "${destDir}"`);
