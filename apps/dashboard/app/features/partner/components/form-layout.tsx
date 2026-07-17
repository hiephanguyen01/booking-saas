import type { ReactNode } from 'react';
import { Label } from '@booking/ui/components/ui/label';

/**
 * Presentational layout primitives shared by the hand-rolled dashboard forms
 * (listing + listing-type). A bordered titled group, a two-column grid, and a
 * labelled field slot that renders the first validation error beneath it.
 */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function Field({ label, error, children }: { label: string; error?: string[]; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error?.length ? <p className="text-xs text-destructive">{error[0]}</p> : null}
    </div>
  );
}
