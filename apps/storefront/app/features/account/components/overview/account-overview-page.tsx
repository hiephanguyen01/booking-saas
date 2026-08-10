import { NsI18n, useTranslation } from '@booking/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@booking/ui/components/ui/avatar';
import { ChevronRight, Heart, LogOut, MessageCircle, Pencil, ReceiptText } from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import { ACCOUNT_NAV_ICONS } from '~/components/account-nav-icons';
import { storefrontPaths } from '~/constants/paths';
import type { AccountOutletContext } from '~/features/account/hooks/use-account-layout-controller';
import { useAccountShellController } from '~/features/account/hooks/use-account-shell-controller';
import { userInitials } from '~/features/account/lib/account-nav';
import type { AccountOverviewStats } from '~/features/account/server/account-overview-route.server';

export function AccountOverviewPage({ stats }: { stats: AccountOverviewStats | null }) {
  const { user, locale, tenant, accountMenuSummary } = useOutletContext<AccountOutletContext>();
  const { t } = useTranslation(NsI18n.Account);
  const { fetcher, groups, logoutAction } = useAccountShellController({
    locale,
    accountMenuSummary,
  });

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 lg:mx-0 lg:mt-0">
      <div className="bg-[#131a2a] px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-20 text-white md:hidden">
        <p className="text-sm font-medium text-white/60">{tenant.name}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('overview.title')}</h1>
      </div>

      <div className="relative mx-auto -mt-14 w-full max-w-3xl px-3 md:mt-0 md:px-0">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-(--sf-surface-shadow)">
          <div className="flex items-center gap-4">
            <Avatar className="size-18 ring-4 ring-background">
              {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
              <AvatarFallback className="bg-primary/10 text-xl font-bold text-primary">
                {userInitials(user.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold">{user.fullName}</h2>
              <p className="truncate text-sm text-muted-foreground">{user.phone ?? user.email}</p>
            </div>
          </div>

          {/* <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-4 text-center">
            <OverviewStat
              icon={ReceiptText}
              label={t('overview.upcoming')}
              value={stats?.upcoming}
            />
            <OverviewStat
              icon={MessageCircle}
              label={t('overview.completed')}
              value={stats?.completed}
            />
            <OverviewStat icon={Heart} label={t('overview.favorites')} value={stats?.favorites} />
          </dl> */}
          {!stats ? (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {t('overview.statsUnavailable')}
            </p>
          ) : null}
        </section>

        <div className="mt-3 space-y-3 pb-5">
          {groups.map((group) => (
            <nav
              key={group.map((item) => item.key).join('-')}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-(--sf-surface-shadow)"
              aria-label={t('title')}
            >
              {group.map((item, index) => {
                const Icon = ACCOUNT_NAV_ICONS[item.key];
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    prefetch="intent"
                    className={`flex min-h-14 items-center gap-3 px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${index ? 'border-t border-border' : ''}`}
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-4.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">{t(`nav.${item.key}`)}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                        {item.badge}
                      </span>
                    ) : null}
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                );
              })}
            </nav>
          ))}

          <fetcher.Form method="post" action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left text-sm font-semibold text-destructive shadow-(--sf-surface-shadow) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="size-5" aria-hidden="true" />
              {fetcher.state === 'submitting' ? t('overview.loggingOut') : t('nav.logout')}
            </button>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}

function OverviewStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Heart;
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="px-2">
      <Icon className="mx-auto size-4 text-primary" aria-hidden="true" />
      <dd className="mt-1 text-xl font-bold text-foreground">{value ?? '—'}</dd>
      <dt className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{label}</dt>
    </div>
  );
}
