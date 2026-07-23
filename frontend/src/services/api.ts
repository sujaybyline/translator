import type { ApiResponse, PreviewResponse, TranslationJob } from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body.data as T;
}

export async function uploadXliff(file: File): Promise<TranslationJob> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/translate/upload`, {
    method: 'POST',
    body: form,
  });
  return parseJson<TranslationJob>(res);
}

export async function startTranslation(jobId: string): Promise<TranslationJob> {
  const res = await fetch(`${API_BASE}/translate/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  return parseJson<TranslationJob>(res);
}

export async function clearJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/translate/${jobId}`, { method: 'DELETE' });
  await parseJson<null>(res);
}

export async function getJob(jobId: string): Promise<TranslationJob> {
  const res = await fetch(`${API_BASE}/translate/${jobId}`);
  return parseJson<TranslationJob>(res);
}

export async function getPreview(
  jobId: string,
  params: { q?: string; page?: number; pageSize?: number } = {},
): Promise<PreviewResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  const res = await fetch(`${API_BASE}/translate/${jobId}/preview${qs ? `?${qs}` : ''}`);
  return parseJson<PreviewResponse>(res);
}

export function getDownloadUrl(jobId: string): string {
  return `${API_BASE}/translate/${jobId}/download`;
}

export async function getHistory(): Promise<TranslationJob[]> {
  const res = await fetch(`${API_BASE}/translation-history`);
  return parseJson<TranslationJob[]>(res);
}

export async function getHealth(): Promise<{
  status: string;
  geminiConfigured: boolean;
  database: string;
}> {
  const res = await fetch(`${API_BASE}/health`);
  return parseJson(res);
}
