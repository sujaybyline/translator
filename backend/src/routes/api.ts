import { Router } from 'express';
import { uploadMiddleware } from '../middleware/upload.js';
import * as ctrl from '../controllers/translateController.js';

const router = Router();

router.get('/health', ctrl.health);
router.post('/translate/upload', uploadMiddleware, ctrl.uploadFile);
router.post('/translate/start', ctrl.startTranslation);
router.get('/translate/:jobId', ctrl.getJob);
router.get('/translate/:jobId/preview', ctrl.getPreview);
router.get('/translate/:jobId/download', ctrl.downloadJob);
router.get('/translation-history', ctrl.getHistory);

export default router;
