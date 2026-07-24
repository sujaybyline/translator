import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDatabase } from './db/pool.js';
import { getPublicAppSettings } from './services/appSettingsService.js';
import { ensureStorageDirectories } from './services/fileStorage.js';
import apiRouter from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';

async function main() {
  await initDatabase();
  await ensureStorageDirectories();

  const app = express();
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.json({ name: 'XLIFF AI Translator API', version: '1.0.0' });
  });

  app.use('/api', apiRouter);
  app.use(errorHandler);

  app.listen(config.port, async () => {
    console.log(`[server] XLIFF AI Translator API listening on http://localhost:${config.port}`);
    console.log(`[server] CORS origin: ${config.frontendUrl}`);
    const settings = await getPublicAppSettings();
    if (!settings.hasApiKey || !settings.provider || !settings.model) {
      console.warn(
        '[server] AI provider is not fully configured. Save provider, model, and API key in Settings.',
      );
    }
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
