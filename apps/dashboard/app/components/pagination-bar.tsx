import { Link } from 'react-router';
import { Button } from '@booking/ui/components/ui/button';

/**
 * The `Trang X / Y` + Trước/Sau footer for server-paginated lists. Renders
 * nothing for a single page. `hrefFor` must preserve the active filters —
 * build it with `pageHref` from `~/lib/pagination`.
 */
export function PaginationBar({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        Trang {page} / {totalPages}
      </span>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" disabled={page <= 1} aria-disabled={page <= 1}>
          <Link to={hrefFor(page - 1)} prefetch="intent">
            Trước
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          aria-disabled={page >= totalPages}
        >
          <Link to={hrefFor(page + 1)} prefetch="intent">
            Sau
          </Link>
        </Button>
      </div>
    </div>
  );
}
