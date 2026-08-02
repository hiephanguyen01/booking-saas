import type { ReactNode } from 'react';
import { Label } from '@booking/ui/components/ui/label';
import { cn } from '@booking/ui/lib/utils';

/**
 * Presentational layout primitives shared by full-page dashboard forms.
 * Forms use one continuous surface; sections create hierarchy with a side rail
 * and dividers instead of stacking independent cards.
 */

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'grid gap-5 border-b px-5 py-7 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8 md:px-7',
        className,
      )}
    >
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function Field({
  label,
  icon,
  error,
  htmlFor,
  errorId,
  children,
}: {
  label: string;
  /** Optional leading glyph, e.g. a listing-type attribute's own icon. */
  icon?: ReactNode;
  error?: string[];
  htmlFor?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {icon ? (
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {icon}
          </span>
        ) : null}
        {label}
      </Label>
      {children}
      {error?.length ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

export function FormSurface({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-xl border bg-background [&>section:last-child]:border-b-0">
      {children}
    </div>
  );
}

export function FormActions({
  children,
  hint,
  className,
}: {
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : <span />}
      <div className="flex flex-wrap items-center justify-end gap-3">{children}</div>
    </div>
  );
}

export function ToggleRow({
  title,
  description,
  control,
  muted,
}: {
  title: string;
  description?: string;
  control: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-5 rounded-lg border px-4 py-3.5',
        muted && 'bg-muted/25',
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

export function fieldNode(
  fields: Array<{ name: string; node: ReactNode }>,
  name: string,
): ReactNode {
  return fields.find((field) => field.name === name)?.node ?? null;
}
