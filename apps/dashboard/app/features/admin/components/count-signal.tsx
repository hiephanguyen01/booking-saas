/**
 * A numeric health signal for the platform admin dashboard: `0` reads calm
 * (muted text), any positive count reads critical — a red ring-pill with a live
 * dot (webhook failures, overdue payouts, …). This is the one place the admin
 * overview signals "a metric that should be zero isn't".
 */
export function CountSignal({ count, unit }: { count: number; unit?: string }) {
  if (count <= 0) {
    return <span className="text-sm text-muted-foreground tabular-nums">0</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/12 px-2 py-0.5 text-xs font-medium text-destructive ring-1 ring-inset ring-destructive/25">
      <span className="size-1.5 rounded-full bg-destructive" aria-hidden />
      {unit ? `${count} ${unit}` : String(count)}
    </span>
  );
}
