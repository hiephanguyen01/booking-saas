import { cn } from '@booking/ui/lib/utils';
import type { ReactNode } from 'react';

/**
 * The title line above a listing rail or grid: a bold heading on the left, and
 * whatever the section offers on the right — a "see all" link, carousel arrows,
 * a permission prompt.
 *
 * It is deliberately *not* a panel. Every home section used to wrap its title in
 * the bordered `PANEL_SURFACE` card, which on a phone spent 64px of height and a
 * full-width border on four words, and made the page read as a stack of boxes
 * rather than as content with headings over it. The surface still belongs to the
 * things that are surfaces — cards, empty states, prompts.
 *
 * A cross-feature primitive because home, catalog, the provider profile and the
 * account pages all want the same line; a copy per feature is how the four of
 * them drifted apart last time.
 */
export function SectionHeading({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Right-hand side: a link, a button, carousel controls. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon}
        <div className="min-w-0">
          <h2 className="text-base leading-6 font-bold text-foreground sm:text-lg sm:leading-7">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm leading-5 text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
