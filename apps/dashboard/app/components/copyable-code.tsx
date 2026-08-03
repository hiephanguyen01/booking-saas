import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';

export interface CopyableCodeProps {
  /** The exact string copied to the clipboard and shown monospace. */
  value: string;
  /** What is being copied, for the button's accessible name, e.g. "mã đặt chỗ". */
  label?: string;
  className?: string;
}

/**
 * A monospace value next to a copy button — for booking codes, referral links,
 * verification tokens, DNS TXT records. Copying is best-effort: if the clipboard
 * API is unavailable the button simply does nothing (no thrown error).
 */
export function CopyableCode({ value, label, className }: CopyableCodeProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async (): Promise<void> => {
    if (await copyText(value)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <code className="min-w-0 truncate rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copyAriaLabel(copied, label)}
        title={copyAriaLabel(copied, label)}
        className="shrink-0 rounded-sm p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {copied ? (
          <Check className="size-3.5 text-success" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </button>
    </span>
  );
}

/** The copy button's accessible name for the given copied state. */
export function copyAriaLabel(copied: boolean, label?: string): string {
  const suffix = label ? ` ${label}` : '';
  return copied ? `Đã sao chép${suffix}` : `Sao chép${suffix}`;
}

/**
 * Best-effort clipboard write. Returns `true` on success, `false` when the
 * clipboard API is missing or rejects. `clipboard` is injectable for testing.
 */
export async function copyText(
  value: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = typeof navigator !== 'undefined'
    ? navigator.clipboard
    : undefined,
): Promise<boolean> {
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
