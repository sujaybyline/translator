export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    uploaded: 'Ready',
    uploading: 'Uploading',
    parsing: 'Parsing XLIFF',
    detecting_language: 'Detecting language',
    preparing: 'Preparing translation',
    translating: 'Translating',
    validating: 'Validating',
    rebuilding: 'Rebuilding XLIFF',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
    pending: 'Pending',
    translated: 'Translated',
    valid: 'Valid',
    needs_review: 'Needs review',
  };
  return map[status] ?? status;
}

export function isAcceptedXliff(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.xlf') || name.endsWith('.xliff');
}
