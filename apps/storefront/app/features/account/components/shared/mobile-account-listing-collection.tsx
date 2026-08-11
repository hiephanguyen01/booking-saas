import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import type { ReactNode } from 'react';

export interface MobileAccountCollectionTab {
  key: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}

/**
 * Mobile collection shell shared by favorites and recently viewed.
 *
 * It mirrors the catalog's mobile result rhythm without introducing another
 * app bar or sticky layer. Cards and empty/error states stay caller-owned so
 * both pages keep their existing data and mutation behavior.
 */
export function MobileAccountListingCollection({
  filterLabel,
  tabs,
  resultCount,
  action,
  children,
}: {
  filterLabel: string;
  tabs: MobileAccountCollectionTab[];
  resultCount?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation(NsI18n.Catalog);

  return (
    <div className="-mx-4 -mt-4 min-h-dvh bg-muted/30 pb-5 font-studio sm:-mx-6 md:hidden">
      <section aria-label={filterLabel}>
        <div className="bg-background px-3 pt-5 pb-3">
          {action ? <div className="flex min-h-8 justify-end">{action}</div> : null}

          <div
            role="tablist"
            aria-label={filterLabel}
            className={cn(
              'sf-scroll-x flex items-center gap-2 overflow-x-auto',
              action && 'mt-3',
            )}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={tab.active}
                onClick={tab.onSelect}
                className={cn(
                  'min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  tab.active
                    ? 'border-primary bg-primary/10 text-primary hover:bg-primary/15'
                    : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {resultCount === undefined ? null : (
          <p className="px-3 pt-3 text-[11.5px] text-muted-foreground">
            {t('resultsCount', { count: resultCount })}
          </p>
        )}

        <div className="flex flex-col gap-(--sf-section-gap) px-3 pt-(--sf-section-gap) pb-4">
          {children}
        </div>
      </section>
    </div>
  );
}
