import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
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
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          'relative overflow-hidden rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all duration-300',
          dragging
            ? 'border-[var(--color-brand)] bg-[color-mix(in_oklab,var(--color-brand)_8%,white)] scale-[1.01]'
            : 'border-[var(--color-line)] bg-white/70 hover:border-[var(--color-brand-light)]',
          disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer',
        ].join(' ')}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--color-brand) 18%, transparent) 1px, transparent 0)',
            backgroundSize: '18px 18px',
          }}
        />
        <div className="relative">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-paper-2)] text-[var(--color-brand)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-lg font-semibold text-[var(--color-ink)]">
            Drop your .xlf or .xliff file here
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">or</p>
          <button
            type="button"
            className="mt-3 rounded-xl bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-brand-light)]"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            disabled={disabled}
          >
            Browse Files
          </button>
          <p className="mt-4 text-xs text-[var(--color-ink-soft)]">
            Supported: .xlf, .xliff · One file at a time · Max 10 MB
          </p>
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
        <p className="mt-3 rounded-lg bg-[color-mix(in_oklab,var(--color-danger)_12%,white)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {localError}
        </p>
      )}
    </div>
  );
}
