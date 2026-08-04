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
  icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** The same glyph the wizard shows for this section, so both tiers match. */
  icon?: ReactNode;
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
        {icon ? (
          <div className="mb-2 grid size-9 place-items-center rounded-xl border bg-background text-primary shadow-xs [&_svg]:size-4">
            {icon}
          </div>
        ) : null}
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
  required = false,
  children,
}: {
  label: string;
  /** Optional leading glyph, e.g. a listing-type attribute's own icon. */
  icon?: ReactNode;
  error?: string[];
  htmlFor?: string;
  errorId?: string;
  required?: boolean;
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
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
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

/**
 * `GenericForm`'s `actionsClassName` for a full-page form: the submit row sits
 * right-aligned under the surface, separated by a rule.
 */
export const FORM_ACTIONS_ROW = 'justify-end border-t pt-4';

/**
 * `FORM_ACTIONS_ROW` for a form tall enough that its end is off-screen — the
 * storefront theme editor runs past 2,500px, so its only save control used to sit
 * a full page-height of scrolling away from whichever field was just edited. The
 * row pins to the bottom of the viewport instead and rides along with the form.
 */
export const FORM_ACTIONS_STICKY =
  'sticky bottom-0 z-10 justify-end border-t bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85';

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
