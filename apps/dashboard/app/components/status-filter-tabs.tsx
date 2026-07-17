import { Tabs, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';

export interface StatusFilterOption {
  value: string;
  label: string;
}

/**
 * The status-filter Tabs row with per-status count chips used by list pages.
 * Pair with `useStatusFilter` for the client-side filtering + counts.
 */
export function StatusFilterTabs({
  filters,
  counts,
  value,
  onChange,
}: {
  filters: readonly StatusFilterOption[];
  counts: Record<string, number>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList className="flex-wrap">
        {filters.map((f) => (
          <TabsTrigger key={f.value} value={f.value} className="gap-2">
            {f.label}
            <span className="rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
              {counts[f.value] ?? 0}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
