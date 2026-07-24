import { useState } from 'react';
import { useSearchParams } from 'react-router';

const COPIED_FEEDBACK_MS = 1800;

export function useHeaderActionsController() {
  const [searchParams] = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(searchParams.get('report') === '1');

  async function copyLink(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        copyTextFallback(window.location.href);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      setCopied(copyTextFallback(window.location.href));
    }
  }

  return {
    copied,
    copyLink,
    reportOpen,
    setReportOpen,
  };
}

function copyTextFallback(value: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}
