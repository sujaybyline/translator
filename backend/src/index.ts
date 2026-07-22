import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDatabase } from './db/pool.js';
import apiRouter from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';

async function main() {
  await initDatabase();

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

  app.listen(config.port, () => {
    console.log(`[server] XLIFF AI Translator API listening on http://localhost:${config.port}`);
    console.log(`[server] CORS origin: ${config.frontendUrl}`);
    if (!config.geminiApiKey || config.geminiApiKey === 'your_api_key_here') {
      console.warn('[server] WARNING: GEMINI_API_KEY is not set. Translation will fail until configured.');
    }
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
