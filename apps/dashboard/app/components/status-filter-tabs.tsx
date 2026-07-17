import { useNavigate } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';

export interface StatusFilterOption {
  value: string;
  label: string;
}

/**
 * URL-driven status-filter Tabs row. Selecting a tab navigates to `hrefFor(value)`
 * (built from `readListParams(...).filterHref`, resetting to page 1) so the loader
 * re-runs and filtering stays correct across a server-paginated list. `counts` is
 * optional — pass a server-computed map to show the chips, omit to hide them.
 */
export function StatusFilterTabs({
  filters,
  value,
  hrefFor,
  counts,
}: {
  filters: readonly StatusFilterOption[];
  value: string;
  hrefFor: (value: string) => string;
  counts?: Record<string, number>;
}) {
  const navigate = useNavigate();
  return (
    <Tabs value={value} onValueChange={(v) => navigate(hrefFor(v))}>
      <TabsList className="flex-wrap">
        {filters.map((f) => (
          <TabsTrigger key={f.value} value={f.value} className="gap-2">
            {f.label}
            {counts ? (
              <span className="rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                {counts[f.value] ?? 0}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
