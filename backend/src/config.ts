import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// config.ts lives at backend/src/ (or backend/dist/src/ if compiled)
// so backendRoot is always one level up from __dirname
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');

// Primary: backend/.env — co-located with the server, used in production
// Fallback: project root .env — dev mono-repo convenience
dotenv.config({ path: path.resolve(backendRoot, '.env') });
dotenv.config({ path: path.resolve(projectRoot, '.env') });

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function resolveStoragePath(envValue: string | undefined, fallbackRelative: string): string {
  if (envValue?.trim()) {
    return path.isAbsolute(envValue) ? envValue : path.resolve(projectRoot, envValue);
  }
  return path.resolve(projectRoot, fallbackRelative);
}

export const config = {
  port: intEnv('PORT', 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
  batchSize: intEnv('TRANSLATION_BATCH_SIZE', 8),
  batchDelayMs: intEnv('TRANSLATION_BATCH_DELAY_MS', 2500),
  maxRetries: intEnv('TRANSLATION_MAX_RETRIES', 3),
  maxFileSize: intEnv('MAX_FILE_SIZE', 10 * 1024 * 1024),
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: intEnv('DB_PORT', 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'xliff_translator',
    url: process.env.DATABASE_URL ?? '',
  },
  paths: {
    uploads: resolveStoragePath(process.env.UPLOAD_DIR, 'uploads'),
    output: resolveStoragePath(process.env.OUTPUT_DIR, 'output'),
    backup: resolveStoragePath(process.env.BACKUP_DIR, 'backup'),
  },
  defaultTargetLanguage: 'de' as const,
};

export function assertGeminiConfigured(): void {
  if (!config.geminiApiKey || config.geminiApiKey === 'your_api_key_here') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it to your .env file (see .env.example).',
    );
  }
}
