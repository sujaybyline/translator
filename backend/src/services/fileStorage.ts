import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export async function ensureStorageDirectories(): Promise<void> {
  await Promise.all(
    [config.paths.uploads, config.paths.output, config.paths.backup].map((dir) =>
      fs.mkdir(dir, { recursive: true }),
    ),
  );
}

function backupDateDirectory(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return path.join(String(year), month, day);
}

/** Copy a translated output file into the dated backup tree. */
export async function backupTranslatedFile(
  sourcePath: string,
  filename: string,
): Promise<string> {
  const backupDir = path.join(config.paths.backup, backupDateDirectory());
  await fs.mkdir(backupDir, { recursive: true });

  const destinationPath = path.join(backupDir, filename);
  await fs.copyFile(sourcePath, destinationPath);
  return destinationPath;
}

export async function removeFiles(
  ...filePaths: Array<string | null | undefined>
): Promise<void> {
  await Promise.all(
    filePaths
      .filter((filePath): filePath is string => Boolean(filePath))
      .map((filePath) => fs.unlink(filePath).catch(() => undefined)),
  );
}
