import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import type { ReactNode } from 'react';
import { storefrontPaths } from '~/constants/paths';
import { MobileFlowHeader } from '~/features/site-shell/components/mobile-flow-header';
import type { AccountOutletContext } from '~/features/account/hooks/use-account-layout-controller';

export interface MobileAccountCollectionTab {
  key: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}

/**
 * Mobile collection shell shared by favorites and recently viewed.
 *
 * It mirrors the catalog's mobile result rhythm while keeping account-specific
 * navigation and controls. Cards and empty/error states stay caller-owned so
 * both pages keep their existing data and mutation behavior.
 */
export function MobileAccountListingCollection({
  title,
  locale,
  filterLabel,
  tabs,
  resultCount,
  action,
  children,
}: {
  title: string;
  locale: AccountOutletContext['locale'];
  filterLabel: string;
  tabs: MobileAccountCollectionTab[];
  resultCount?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation([NsI18n.Catalog, NsI18n.Common]);

  return (
    <div className="-mx-4 -mt-4 min-h-dvh bg-muted/30 pb-5 font-studio sm:-mx-6 md:hidden">
      <MobileFlowHeader
        title={title}
        backHref={storefrontPaths.account.overview(locale)}
        backLabel={t('common:back')}
      />

      <div className="border-b border-background/10 bg-foreground px-3 pb-3 text-background">
        <div
          role="tablist"
          aria-label={filterLabel}
          className="sf-scroll-x flex items-center gap-1.5 overflow-x-auto"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.active}
              onClick={tab.onSelect}
              className={cn(
                'min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground',
                tab.active
                  ? 'border-background bg-background text-foreground'
                  : 'border-background/20 text-background/70 hover:border-background/45 hover:text-background',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <section aria-label={title}>
        <div className="flex min-h-11 items-center justify-between gap-3 bg-background/95 px-3 py-2.5 backdrop-blur-sm">
          {resultCount === undefined ? (
            <span />
          ) : (
            <p className="text-[11.5px] text-muted-foreground">
              {t('resultsCount', { count: resultCount })}
            </p>
          )}
          {action}
        </div>

        <div className="flex flex-col gap-(--sf-section-gap) px-3 pt-(--sf-section-gap) pb-4">
          {children}
        </div>
      </section>
    </div>
  );
}
