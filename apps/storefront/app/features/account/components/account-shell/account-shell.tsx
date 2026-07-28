import type { CurrentUser } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { Avatar, AvatarFallback } from '@booking/ui/components/ui/avatar';
import { SheetClose } from '@booking/ui/components/ui/sheet';
import {
  CircleHelp,
  Eye,
  Heart,
  LogOut,
  MessageSquareText,
  NotebookText,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { NavLink } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { type AccountNavKey, userInitials } from '~/features/account/lib/account-nav';
import type { AccountMenuSummary } from '~/features/account/lib/account-menu';
import { useAccountShellController } from '~/features/account/hooks/use-account-shell-controller';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const NAV_ICONS: Record<AccountNavKey, Icon> = {
  profile: UserRound,
  bookings: BookingMenuIcon,
  messages: MessageSquareText,
  reviews: RatingMenuIcon,
  favorites: Heart,
  recent: Eye,
  terms: NotebookText,
  security: ShieldCheck,
  help: CircleHelp,
};

export function AccountShell({
  user,
  locale,
  accountMenuSummary,
  children,
}: {
  user: CurrentUser;
  locale: Locale;
  accountMenuSummary: AccountMenuSummary | null;
  children: React.ReactNode;
}) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <div className="bg-muted/35 font-studio">
      <div className="mx-auto grid w-full max-w-292.5 gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-7.5 lg:py-4 xl:px-0">
        {/* <div className="lg:hidden">
          <MobileAccountNavigation user={user} locale={locale} />
        </div> */}
        <aside className="mt-2 hidden w-64 self-start lg:block" aria-label={t('title')}>
          <AccountIdentity user={user} />
          <AccountNavigation locale={locale} accountMenuSummary={accountMenuSummary} />
        </aside>
        <section className="min-w-0 pb-8">{children}</section>
      </div>
    </div>
  );
}

function AccountIdentity({ user }: { user: CurrentUser }) {
  return (
    <div className="flex w-full items-center gap-3">
      <Avatar className="size-12">
        <AvatarFallback className="bg-primary/10 font-semibold text-primary">
          {userInitials(user.fullName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold leading-6 text-foreground">
          {user.fullName}
        </p>
        <p className="truncate text-sm font-normal leading-5 text-muted-foreground">
          {user.phone ?? user.email}
        </p>
      </div>
    </div>
  );
}

function AccountNavigation({
  locale,
  accountMenuSummary,
  closeOnSelect = false,
}: {
  locale: Locale;
  accountMenuSummary: AccountMenuSummary | null;
  closeOnSelect?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const { fetcher, groups, logoutAction } = useAccountShellController({
    locale,
    accountMenuSummary,
  });

  return (
    <nav
      className="mt-6 flex w-full flex-col gap-2 border-t border-border py-2"
      aria-label={t('title')}
    >
      {groups.map((group, groupIndex) => (
        <div key={group.map((item) => item.key).join('-')} className="flex flex-col">
          {group.map((item) => {
            const IconComponent = NAV_ICONS[item.key];
            const link = (
              <NavLink
                to={item.to}
                prefetch="intent"
                className={({ isActive }) =>
                  `group flex min-h-11 items-center gap-3 px-4 py-3 text-sm font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    isActive
                      ? 'text-primary'
                      : 'text-foreground/80 hover:bg-background/70 hover:text-foreground'
                  } ${item.key === 'messages' ? 'bg-muted/50' : ''}`
                }
              >
                <IconComponent aria-hidden="true" className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">{t(`nav.${item.key}`)}</span>
                {item.badge ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold leading-4 text-primary-foreground">
                    {item.badge}
                  </span>
                ) : null}
              </NavLink>
            );
            return closeOnSelect ? (
              <SheetClose key={item.key} asChild>
                {link}
              </SheetClose>
            ) : (
              <div key={item.key}>{link}</div>
            );
          })}
          {groupIndex < groups.length - 1 ? <div className="mt-2 h-px bg-border" /> : null}
        </div>
      ))}
      <div className="h-px bg-border" />
      <fetcher.Form method="post" action={logoutAction}>
        <button
          type="submit"
          className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium leading-5 text-foreground/80 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <LogOut aria-hidden="true" className="size-5" />
          {t('nav.logout')}
        </button>
      </fetcher.Form>
    </nav>
  );
}

function BookingMenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <rect
        x="2.5"
        y="4"
        width="15"
        height="12"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="5.25"
        y="7"
        width="2.5"
        height="2.5"
        rx="0.4"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M10.25 7.75h4.5M10.25 11.5h4.5M5.25 12.25h2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RatingMenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.25 5.5h7.25M2.25 10h5M2.25 14.5h6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m14 7.5.95 1.92 2.12.31-1.53 1.49.36 2.11-1.9-1-1.9 1 .36-2.11-1.53-1.49 2.12-.31L14 7.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
