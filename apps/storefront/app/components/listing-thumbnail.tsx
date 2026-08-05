import { Camera } from 'lucide-react';

/**
 * The stand-in shown wherever a booking or listing has no photo.
 *
 * A cross-feature primitive rather than an account one: the account history, the
 * account detail and the guest booking lookup all fall back to it, and a
 * placeholder that differs between them would read as three different products.
 */
export function ListingThumbnail({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      className={`relative flex overflow-hidden bg-[linear-gradient(135deg,var(--muted),var(--background)_48%,color-mix(in_oklab,var(--primary)_14%,var(--muted)))] ${className}`}
    >
      <div className="absolute -right-6 -top-7 size-24 rounded-full border border-primary/15 bg-primary/5" />
      <div className="absolute -bottom-8 -left-5 size-24 rounded-full bg-foreground/5" />
      <Camera aria-hidden="true" className="m-auto size-7 text-primary/55" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
