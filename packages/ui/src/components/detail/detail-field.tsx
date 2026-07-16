import * as React from 'react';
import { Lock, TriangleAlert } from 'lucide-react';

import { cn } from '@booking/ui/lib/utils';

/**
 * A non-value display state that overrides `value`:
 * - `empty` — nothing to show, renders an em dash.
 * - `suppressed` — hidden on purpose (e.g. permission-denied); shows a lock +
 *   the `reason` as a tooltip/title.
 * - `failed` — the value could not be loaded; shows a warning icon + copy.
 */
export type DetailFieldState =
  | { kind: 'empty' }
  | { kind: 'suppressed'; reason: string }
  | { kind: 'failed' };

export interface DetailFieldProps {
  /** Muted uppercase-tracked `<dt>` label. */
  label: string;
  /**
   * The `<dd>` content — ReactNode, not string: a field can hold a link, a
   * badge, a masked phone, a copy button, or an em dash. Overridden by `state`.
   */
  value?: React.ReactNode;
  /** Secondary line rendered under the value. */
  hint?: React.ReactNode;
  /** How many grid columns the field spans (for long values). Default 1. */
  span?: 1 | 2 | 3;
  /** Value typography. `strong` → semibold tabular; `muted` → muted text. */
  emphasis?: 'default' | 'strong' | 'muted';
  /** Overrides `value` with a lock/warning/em-dash affordance. */
  state?: DetailFieldState;
  /** When the value is empty and no `state` is set, drop the field entirely. */
  omitWhenEmpty?: boolean;
  className?: string;
}

type Resolution =
  | { render: 'hidden' }
  | { render: 'state'; state: DetailFieldState }
  | { render: 'value' };

/** A value is "empty" only when it is `null`, `undefined`, or an empty string. */
function isEmptyValue(value: React.ReactNode): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Pure decision for what a `DetailField` renders. `state` always wins; then an
 * empty value is either dropped (`omitWhenEmpty`) or shown as an em dash.
 */
export function resolveDetailFieldContent(
  props: Pick<DetailFieldProps, 'value' | 'state' | 'omitWhenEmpty'>,
): Resolution {
  if (props.state) return { render: 'state', state: props.state };
  if (isEmptyValue(props.value)) {
    return props.omitWhenEmpty ? { render: 'hidden' } : { render: 'state', state: { kind: 'empty' } };
  }
  return { render: 'value' };
}

const SPAN_CLASS: Record<NonNullable<DetailFieldProps['span']>, string> = {
  1: '',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
};

const EMPHASIS_CLASS: Record<NonNullable<DetailFieldProps['emphasis']>, string> = {
  default: '',
  strong: 'font-semibold tabular-nums',
  muted: 'text-muted-foreground',
};

function StateContent({ state }: { state: DetailFieldState }): React.JSX.Element {
  if (state.kind === 'empty') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (state.kind === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-warning">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        Không tải được
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-muted-foreground"
      title={state.reason}
    >
      <Lock className="size-3.5 shrink-0" aria-hidden />
      <span aria-hidden>••••</span>
      <span className="sr-only">{state.reason}</span>
    </span>
  );
}

/**
 * A `<dt>`/`<dd>` pair for use inside a `DetailGrid`. Copies the dashboard's
 * `text-xs font-medium uppercase tracking-wide text-muted-foreground` label
 * style and the em-dash empty convention, so it is a drop-in for the
 * hand-rolled `Field` components across the detail pages.
 */
export function DetailField({
  label,
  value,
  hint,
  span = 1,
  emphasis = 'default',
  state,
  omitWhenEmpty,
  className,
}: DetailFieldProps): React.JSX.Element | null {
  const resolution = resolveDetailFieldContent({ value, state, omitWhenEmpty });
  if (resolution.render === 'hidden') return null;

  return (
    <div className={cn('space-y-1', SPAN_CLASS[span], className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('text-sm', EMPHASIS_CLASS[emphasis])}>
        {resolution.render === 'state' ? <StateContent state={resolution.state} /> : value}
      </dd>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
