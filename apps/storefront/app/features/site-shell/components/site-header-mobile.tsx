import type { CurrentUser } from '@booking/contracts';
import { type Locale, NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { TenantInstallTrigger } from '~/features/pwa/components/tenant-install-trigger';

export function SiteHeaderMobile({
  brand,
  locale,
  currentUser,
  overlay,
  redirectTo,
}: {
  brand: ReactNode;
  locale: Locale;
  currentUser: CurrentUser | null;
  overlay: boolean;
  redirectTo: string;
}) {
  const { t } = useTranslation(NsI18n.Navigation);
  const accountHref = currentUser
    ? storefrontPaths.account.root(locale)
    : storefrontPaths.login(locale, redirectTo);
  const accountLabel = currentUser ? t('bottomNav.account') : t('login');

  return (
    <div className="flex h-18 items-center justify-between gap-3 lg:hidden">
      <div className="min-w-0 flex-1">{brand}</div>
      <TenantInstallTrigger
        fallback={
          <Button
            asChild
            variant="ghost"
            className={cn(
              'h-9.5 shrink-0 rounded-md px-3 text-xs font-bold',
              overlay
                ? 'border border-white/40 bg-white/12 text-white backdrop-blur-sm hover:bg-white/25 hover:text-white'
                : 'text-primary hover:bg-primary/10 hover:text-primary',
            )}
          >
            <Link to={accountHref} prefetch="intent">
              {accountLabel}
            </Link>
          </Button>
        }
      />
    </div>
  );
}
