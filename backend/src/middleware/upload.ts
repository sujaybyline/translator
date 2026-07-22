import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { isSupportedXliffExtension } from '../parsers/xliffParser.js';
import { AppError } from './errorHandler.js';

fs.mkdirSync(config.paths.uploads, { recursive: true });
fs.mkdirSync(config.paths.output, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.paths.uploads);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  if (!isSupportedXliffExtension(file.originalname)) {
    cb(new AppError('Unsupported file type. Only .xlf and .xliff files are allowed.'));
    return;
  }
  cb(null, true);
}

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: config.maxFileSize, files: 1 },
  fileFilter,
}).single('file');
