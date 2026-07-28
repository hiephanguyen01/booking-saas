import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Renders a lucide icon by NAME — the tenant-chosen `icon` stored on a listing type
 * or a custom attribute (the same allowlist the dashboard picker writes). Falls back
 * to `fallback` (default: none) when the name is unset or not a known lucide export,
 * so an unknown/legacy name never throws.
 */
export function LucideByName({
  name,
  className,
  fallback: Fallback,
}: {
  name?: string | null;
  className?: string;
  fallback?: LucideIcon;
}) {
  const Icon =
    (name && (Icons as unknown as Record<string, LucideIcon | undefined>)[name]) || Fallback;
  return Icon ? <Icon className={className} aria-hidden="true" /> : null;
}
