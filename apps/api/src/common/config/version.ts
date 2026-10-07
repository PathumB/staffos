import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolved relative to this file so it works from both src/ (tests) and dist/ (runtime).
const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as {
  version: string;
};

export const APP_VERSION: string = pkg.version;
