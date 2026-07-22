import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { config } from '../config.js';
import type { TranslationJobRecord, TranslationSegmentRecord } from '../types/index.js';

let pool: Pool | null = null;
let dbAvailable = false;

export function isDatabaseAvailable(): boolean {
  return dbAvailable;
}

export async function initDatabase(): Promise<void> {
  try {
    if (config.db.url) {
      pool = mysql.createPool(config.db.url);
    } else {
      pool = mysql.createPool({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
        waitForConnections: true,
        connectionLimit: 10,
        namedPlaceholders: true,
      });
    }
    await pool.query('SELECT 1');
    dbAvailable = true;
    console.log('[db] MySQL connected');
  } catch (err) {
    dbAvailable = false;
    pool = null;
    console.warn(
      '[db] MySQL unavailable — jobs will use in-memory store. Configure DB_* in .env for persistence.',
    );
    console.warn('[db]', err instanceof Error ? err.message : err);
  }
}

export function getPool(): Pool {
  if (!pool) throw new Error('Database pool is not initialized.');
  return pool;
}

export async function insertJob(job: {
  id: string;
  original_filename: string;
  output_filename?: string | null;
  source_language?: string | null;
  target_language: string;
  xliff_version?: string | null;
  total_segments?: number;
  translated_segments?: number;
  status: string;
  error_message?: string | null;
  upload_path?: string | null;
  output_path?: string | null;
  file_size?: number | null;
}): Promise<void> {
  if (!dbAvailable || !pool) return;
  await pool.execute(
    `INSERT INTO translation_jobs
      (id, original_filename, output_filename, source_language, target_language,
       xliff_version, total_segments, translated_segments, status, error_message,
       upload_path, output_path, file_size)
     VALUES
      (:id, :original_filename, :output_filename, :source_language, :target_language,
       :xliff_version, :total_segments, :translated_segments, :status, :error_message,
       :upload_path, :output_path, :file_size)`,
    {
      id: job.id,
      original_filename: job.original_filename,
      output_filename: job.output_filename ?? null,
      source_language: job.source_language ?? null,
      target_language: job.target_language,
      xliff_version: job.xliff_version ?? null,
      total_segments: job.total_segments ?? 0,
      translated_segments: job.translated_segments ?? 0,
      status: job.status,
      error_message: job.error_message ?? null,
      upload_path: job.upload_path ?? null,
      output_path: job.output_path ?? null,
      file_size: job.file_size ?? null,
    },
  );
}

export async function updateJob(
  id: string,
  fields: Partial<{
    output_filename: string | null;
    source_language: string | null;
    xliff_version: string | null;
    total_segments: number;
    translated_segments: number;
    status: string;
    error_message: string | null;
    output_path: string | null;
    completed_at: Date | null;
  }>,
): Promise<void> {
  if (!dbAvailable || !pool) return;
  const allowed = [
    'output_filename',
    'source_language',
    'xliff_version',
    'total_segments',
    'translated_segments',
    'status',
    'error_message',
    'output_path',
    'completed_at',
  ] as const;

  const sets: string[] = [];
  const params: Record<string, string | number | Date | null> = { id };
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = :${key}`);
      const value = fields[key];
      params[key] = value === undefined ? null : (value as string | number | Date | null);
    }
  }
  if (sets.length === 0) return;

  await pool.execute(`UPDATE translation_jobs SET ${sets.join(', ')} WHERE id = :id`, params);
}

export async function getJobById(id: string): Promise<TranslationJobRecord | null> {
  if (!dbAvailable || !pool) return null;
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM translation_jobs WHERE id = :id',
    { id },
  );
  return (rows[0] as TranslationJobRecord) ?? null;
}

export async function listJobs(limit = 100): Promise<TranslationJobRecord[]> {
  if (!dbAvailable || !pool) return [];
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM translation_jobs ORDER BY created_at DESC LIMIT :limit',
    { limit },
  );
  return rows as TranslationJobRecord[];
}

export async function replaceSegments(
  jobId: string,
  segments: Array<{
    segment_identifier: string;
    source_text: string;
    translated_text?: string | null;
    validation_status?: string;
    status?: string;
    sort_order: number;
  }>,
): Promise<void> {
  if (!dbAvailable || !pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM translation_segments WHERE translation_job_id = ?', [jobId]);
    for (const seg of segments) {
      await conn.execute(
        `INSERT INTO translation_segments
          (translation_job_id, segment_identifier, source_text, translated_text,
           validation_status, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          jobId,
          seg.segment_identifier,
          seg.source_text,
          seg.translated_text ?? null,
          seg.validation_status ?? 'pending',
          seg.status ?? 'pending',
          seg.sort_order,
        ],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getSegmentsByJobId(
  jobId: string,
): Promise<TranslationSegmentRecord[]> {
  if (!dbAvailable || !pool) return [];
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM translation_segments
     WHERE translation_job_id = :jobId
     ORDER BY sort_order ASC, id ASC`,
    { jobId },
  );
  return rows as TranslationSegmentRecord[];
}

export async function pingDatabase(): Promise<boolean> {
  if (!dbAvailable || !pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Satisfy unused import lint if ResultSetHeader unused
export type { ResultSetHeader };
