import { tmpdir } from 'node:os';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Runs before every test file (jest `setupFiles`), i.e. before ConfigModule reads the environment.

// Pick up DATABASE_URL_TEST from the root .env locally; real env vars (CI) take precedence.
loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
// Tests must never touch the dev database: only DATABASE_URL_TEST is ever used (CLAUDE.md §13).
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? '';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef';
process.env.MAIL_PROVIDER = 'console';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.APP_URL = 'http://localhost:5173';
// Uploads go to a throwaway folder, never the dev uploads directory.
process.env.STORAGE_PROVIDER = 'local';
// Tests never call a real AI API (CLAUDE.md §12).
process.env.LLM_DEFAULT_PROVIDER = 'mock';
process.env.AI_MONTHLY_BUDGET_USD = '0';
process.env.STORAGE_LOCAL_DIR = path.join(tmpdir(), 'staffos-test-uploads');
