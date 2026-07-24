import type { CurrentUser } from '@booking/contracts';
import { Avatar, AvatarFallback } from '@booking/ui/components/ui/avatar';
import { Button } from '@booking/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@booking/ui/components/ui/dropdown-menu';
import {
  CircleHelp,
  Eye,
  Heart,
  LogOut,
  MessageSquareText,
  NotebookText,
  Pencil,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { type ComponentType, Fragment, type SVGProps } from 'react';
import { Link, useFetcher } from 'react-router';
import type { AccountMenuSummary } from '../features/account/account-menu';
import { type AccountNavKey, userInitials } from '../features/account/account-nav';
import { type Locale, NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths } from '../lib/locale-paths';
import { useSiteHeaderAccountMenuController } from './use-site-header-account-menu-controller';

type AccountMenuIcon = ComponentType<SVGProps<SVGSVGElement>>;

const ACCOUNT_MENU_ICONS: Record<AccountNavKey, AccountMenuIcon> = {
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

const ACCOUNT_MENU_DIVIDERS = new Set<AccountNavKey>(['reviews', 'recent', 'help']);

export function SiteHeaderAccountMenu({
  currentUser,
  locale,
  accountMenuSummary,
}: {
  currentUser: CurrentUser;
  locale: Locale;
  accountMenuSummary: AccountMenuSummary | null;
}) {
  const { t } = useTranslation([NsI18n.Navigation, NsI18n.Account]);
  const { fetcher, items, logoutAction } = useSiteHeaderAccountMenuController({
    locale,
    accountMenuSummary,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('navigation:accountMenu')}
          className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <SiteHeaderAccountAvatar currentUser={currentUser} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[263px] overflow-hidden rounded-[8px] border border-border bg-background p-0 font-studio shadow-lg"
      >
        <DropdownMenuLabel className="flex min-h-17 items-center gap-3 px-4 py-3.5">
          <span className="relative shrink-0">
            <SiteHeaderAccountAvatar currentUser={currentUser} />
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm"
            >
              <Pencil className="size-2.5" />
            </span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-5 text-foreground">
              {currentUser.fullName}
            </span>
            <span className="block truncate text-xs font-normal leading-5 text-muted-foreground">
              {currentUser.email}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-0 my-0" />
        {items.map((item) => {
          const Icon = ACCOUNT_MENU_ICONS[item.key];
          return (
            <Fragment key={item.key}>
              <DropdownLink to={item.to} icon={Icon} badge={item.badge} active={item.active}>
                {t(`account:nav.${item.key}`)}
              </DropdownLink>
              {ACCOUNT_MENU_DIVIDERS.has(item.key) ? (
                <DropdownMenuSeparator className="mx-0 my-0" />
              ) : null}
            </Fragment>
          );
        })}
        <fetcher.Form method="post" action={logoutAction}>
          <DropdownMenuItem asChild>
            <button
              type="submit"
              className="min-h-11.5 w-full gap-3 rounded-none px-4 py-3 text-sm font-medium leading-5 text-foreground focus:bg-muted"
            >
              <LogOut className="size-5.5 text-foreground/80" />
              {t('navigation:logout')}
            </button>
          </DropdownMenuItem>
        </fetcher.Form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeaderAccountAvatar({
  currentUser,
  className,
}: {
  currentUser: CurrentUser;
  className?: string;
}) {
  return (
    <Avatar size="lg" className={className}>
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
        {userInitials(currentUser.fullName)}
      </AvatarFallback>
    </Avatar>
  );
}

export function SiteHeaderLogoutForm({
  locale,
  label,
  mobile = false,
}: {
  locale: Locale;
  label: string;
  mobile?: boolean;
}) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" action={storefrontPaths.logout(locale)}>
      <Button
        type="submit"
        variant="ghost"
        className={
          mobile
            ? 'h-auto justify-start rounded-sm px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive'
            : 'h-10 rounded-sm px-2 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive'
        }
      >
        {label}
      </Button>
    </fetcher.Form>
  );
}

function DropdownLink({
  to,
  icon: Icon,
  badge,
  active = false,
  children,
}: {
  to: string;
  icon: AccountMenuIcon;
  badge?: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuItem asChild>
      <Link
        to={to}
        prefetch="intent"
        aria-current={active ? 'page' : undefined}
        className={`min-h-11 gap-3 rounded-none px-4 py-2.5 text-sm font-medium leading-5 focus:bg-muted focus:text-foreground ${
          active ? 'bg-muted text-foreground' : 'text-foreground/85'
        }`}
      >
        <Icon className="size-5 text-foreground/80" />
        <span className="flex-1">{children}</span>
        {badge ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold leading-4 text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </Link>
    </DropdownMenuItem>
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
    <svg viewBox="0 0 22 22" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.5 6h8M2.5 11h5.5M2.5 16h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m15.5 8.25 1.05 2.13 2.35.34-1.7 1.66.4 2.34-2.1-1.1-2.1 1.1.4-2.34-1.7-1.66 2.35-.34 1.05-2.13Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}
