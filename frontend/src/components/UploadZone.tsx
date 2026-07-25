import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Upload, XCircle } from 'lucide-react';
import { isAcceptedXliff } from '../utils/format';

interface Props {
  disabled?: boolean;
  onFile: (file: File) => void;
}

export function UploadZone({ disabled, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!isAcceptedXliff(file)) {
        setLocalError('Unsupported file type. Please upload a .xlf or .xliff file.');
        return;
      }
      setLocalError(null);
      onFile(file);
    },
    [onFile],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files?.[0]);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          'group relative overflow-hidden rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200',
          dragging
            ? 'border-[var(--color-brand)] bg-[color-mix(in_oklab,var(--color-brand)_6%,white)] scale-[1.005]'
            : 'border-[var(--color-line)] bg-white/60 hover:border-[var(--color-brand)]/60 hover:bg-white/80',
          disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer',
        ].join(' ')}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload XLIFF file"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--color-brand) 25%, transparent) 1px, transparent 0)',
            backgroundSize: '20px 20px',
          }}
        />

        <div className="relative flex flex-col items-center gap-3">
          <div className={[
            'grid h-16 w-16 place-items-center rounded-2xl transition-all duration-200',
            dragging
              ? 'bg-[var(--color-brand)] text-white scale-110'
              : 'bg-[var(--color-paper-2)] text-[var(--color-brand)] group-hover:bg-[color-mix(in_oklab,var(--color-brand)_10%,white)]',
          ].join(' ')}>
            <Upload size={28} strokeWidth={1.75} aria-hidden />
          </div>

          <div>
            <p className="text-base font-semibold text-[var(--color-ink)]">
              {dragging ? 'Drop to upload' : 'Drop your .xlf or .xliff file here'}
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">or click to browse</p>
          </div>

          <button
            type="button"
            className="mt-1 rounded-xl bg-[var(--color-brand)] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--color-brand-light)] hover:shadow-md active:scale-95"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            disabled={disabled}
          >
            Browse Files
          </button>

          <p className="text-xs text-[var(--color-ink-soft)]/70">.xlf · .xliff · max 10 MB</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlf,.xliff,application/xliff+xml,application/xml,text/xml"
          className="hidden"
          onChange={onChange}
          disabled={disabled}
        />
      </div>

      {localError && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[color-mix(in_oklab,var(--color-danger)_10%,white)] px-4 py-3 text-sm text-[var(--color-danger)]">
          <XCircle size={16} className="shrink-0" aria-hidden />
          {localError}
        </div>
      )}
    </div>
  );
}
