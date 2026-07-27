import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { uploadMiddleware } from '../middleware/upload.js';
import * as ctrl from '../controllers/translateController.js';
import * as qaCtrl from '../controllers/qaController.js';
import { config } from '../config.js';

const router = Router();

// Two-file upload for QA comparison
const qaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.paths.uploads),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: config.maxFileSize, files: 2 },
}).fields([
  { name: 'source', maxCount: 1 },
  { name: 'translated', maxCount: 1 },
]);

// Single-file upload for QA review
const qaReviewUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.paths.uploads),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: config.maxFileSize, files: 1 },
}).fields([{ name: 'file', maxCount: 1 }]);

router.get('/health', ctrl.health);
router.post('/translate/upload', uploadMiddleware, ctrl.uploadFile);
router.post('/translate/start', ctrl.startTranslation);
router.delete('/translate/:jobId', ctrl.clearJob);
router.get('/translate/:jobId', ctrl.getJob);
router.get('/translate/:jobId/preview', ctrl.getPreview);
router.get('/translate/:jobId/download', ctrl.downloadJob);
router.get('/translate/:jobId/download-source', ctrl.downloadJobSourceOnly);
router.put('/translate/:jobId/segment', ctrl.updateSegment);
router.get('/translation-history', ctrl.getHistory);
router.get('/settings', ctrl.getSettings);
router.put('/settings', ctrl.saveSettings);

// QA
router.post('/qa/compare', qaUpload, qaCtrl.compareXliff);
router.post('/qa/review', qaReviewUpload, qaCtrl.reviewXliff);
router.get('/qa/running', qaCtrl.getRunningQAJobs);
router.delete('/qa/:jobId', qaCtrl.cancelQAJob);

export default router;
