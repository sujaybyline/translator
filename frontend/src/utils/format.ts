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

export function formatPreviewText(value: string | null | undefined): string {
  if (!value) return '';

  const decoded = value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
      const number = code.toLowerCase().startsWith('x')
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isInteger(number) && number >= 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : '';
    })
    .replace(/&amp;/g, '&');

  return decoded
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-\s+/g, '-')
    .trim();
}

export function isAcceptedXliff(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.xlf') || name.endsWith('.xliff');
}
