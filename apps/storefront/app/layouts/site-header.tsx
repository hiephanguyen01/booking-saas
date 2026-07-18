import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
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
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@booking/ui/components/ui/sheet';
import {
  CircleHelp,
  Eye,
  Globe2,
  Heart,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquareText,
  NotebookText,
  Pencil,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { type ComponentType, Fragment, type SVGProps } from 'react';
import { Link, NavLink, useFetcher, useLocation } from 'react-router';
import type { AccountMenuSummary } from '../features/account/account-menu';
import { accountNavItems, type AccountNavKey, userInitials } from '../features/account/account-nav';
import { type Locale, NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths, switchLocalePath } from '../lib/locale-paths';
import type { StorefrontTenant } from '../lib/tenant.server';
import { TenantBrand } from './tenant-brand';

/** Shared sizing for the desktop nav controls, which are shorter than the Button default. */
const NAV_BUTTON = 'h-10 rounded-sm px-4 text-xs font-semibold';

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

/** Tenant-aware header shared by the storefront, customer auth, and partner flows. */
export function SiteHeader({
  tenant,
  listingTypes,
  locale,
  currentUser = null,
  accountMenuSummary = null,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  currentUser?: CurrentUser | null;
  accountMenuSummary?: AccountMenuSummary | null;
}) {
  const { t } = useTranslation(NsI18n.Navigation);
  const location = useLocation();
  const redirectTo = `${location.pathname}${location.search}`;

  return (
    <header className="sticky top-0 z-40 bg-background font-studio text-foreground shadow-sm">
      <div className="mx-auto w-full max-w-292.5 px-4 sm:px-6 xl:px-0">
        <div className="hidden h-18 items-center justify-between lg:flex">
          <BrandHomeLink locale={locale} tenant={tenant} />

          <nav aria-label={t('mainNavigation')} className="flex items-center gap-4">
            <Button asChild variant="outline" className={`${NAV_BUTTON} border-foreground`}>
              <Link to={storefrontPaths.community(locale)} prefetch="intent">
                <Globe2 aria-hidden="true" className="size-4" />
                {t('community')}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className={`${NAV_BUTTON} border-primary text-primary hover:bg-primary/10 hover:text-primary`}
            >
              <Link to={storefrontPaths.becomePartner(locale)} prefetch="intent">
                {t('becomePartner')}
              </Link>
            </Button>
            {currentUser ? (
              <AuthenticatedActions
                currentUser={currentUser}
                locale={locale}
                accountMenuSummary={accountMenuSummary}
              />
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className={`${NAV_BUTTON} text-primary hover:bg-primary/10 hover:text-primary`}
                >
                  <Link to={storefrontPaths.login(locale, redirectTo)} prefetch="intent">
                    {t('login')}
                  </Link>
                </Button>
                <Button asChild className={NAV_BUTTON}>
                  <Link to={storefrontPaths.register(locale)} prefetch="intent">
                    {t('register')}
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>

        <Sheet>
          <div className="flex h-18 items-center justify-between lg:hidden">
            <BrandHomeLink locale={locale} tenant={tenant} />
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t('openMenu')}>
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
          </div>
          <SheetContent side="right" className="w-80 font-studio" showCloseButton>
            <SheetTitle className="sr-only">{t('openMenu')}</SheetTitle>
            <div className="flex flex-col gap-1 overflow-y-auto px-4 pb-6 pt-14">
              <MobileNavLink to={storefrontPaths.home(locale)}>
                <LayoutGrid aria-hidden="true" className="size-4" />
                {t('all')}
              </MobileNavLink>
              {listingTypes.map((type) => (
                <MobileNavLink key={type.id} to={storefrontPaths.catalog(locale, type.slug)}>
                  {type.name}
                </MobileNavLink>
              ))}
              <MobileNavLink to={storefrontPaths.bookings(locale)}>
                <Search aria-hidden="true" className="size-4" />
                {t('lookup')}
              </MobileNavLink>
              <div className="my-2 h-px bg-border" />
              <MobileNavLink to={storefrontPaths.becomePartner(locale)} emphasized>
                {t('becomePartner')}
              </MobileNavLink>
              {currentUser ? (
                <>
                  <div className="flex items-center gap-3 px-3 py-3">
                    <AccountAvatar currentUser={currentUser} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {currentUser.fullName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {currentUser.email}
                      </p>
                    </div>
                  </div>
                  <MobileNavLink to={storefrontPaths.community(locale)}>
                    <Globe2 aria-hidden="true" className="size-4" />
                    {t('community')}
                  </MobileNavLink>
                  <MobileAccountLinks locale={locale} />
                  <LogoutForm locale={locale} label={t('logout')} mobile />
                </>
              ) : (
                <>
                  <MobileNavLink to={storefrontPaths.login(locale, redirectTo)}>
                    {t('login')}
                  </MobileNavLink>
                  <MobileNavLink to={storefrontPaths.register(locale)} emphasized>
                    {t('register')}
                  </MobileNavLink>
                </>
              )}
              <div className="my-2 h-px bg-border" />
              <LocaleSwitcher current={locale} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

function BrandHomeLink({ locale, tenant }: { locale: Locale; tenant: StorefrontTenant }) {
  const { t } = useTranslation([NsI18n.Navigation]);
  return (
    <Link
      to={storefrontPaths.home(locale)}
      prefetch="intent"
      aria-label={t('brandHome', { tenant: tenant.name })}
      className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TenantBrand name={tenant.name} logoUrl={tenant.logoUrl} width={133} height={40} />
    </Link>
  );
}

function AuthenticatedActions({
  currentUser,
  locale,
  accountMenuSummary,
}: {
  currentUser: CurrentUser;
  locale: Locale;
  accountMenuSummary: AccountMenuSummary | null;
}) {
  const { t } = useTranslation([NsI18n.Navigation, NsI18n.Account]);
  const fetcher = useFetcher();
  const location = useLocation();
  const items = accountNavItems(locale);
  const badges: Partial<Record<AccountNavKey, string>> = {
    messages: formatBadgeCount(accountMenuSummary?.unreadMessages),
    reviews: formatBadgeCount(accountMenuSummary?.pendingReviews),
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('navigation:accountMenu')}
          className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <AccountAvatar currentUser={currentUser} className="ring-4 ring-[#d0fbe8]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[263px] overflow-hidden rounded-[8px] border border-border bg-background p-0 font-studio shadow-lg"
      >
        <DropdownMenuLabel className="flex min-h-17 items-center gap-3 px-4 py-3.5">
          <span className="relative shrink-0">
            <AccountAvatar currentUser={currentUser} />
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
              <DropdownLink
                to={item.to}
                icon={Icon}
                badge={badges[item.key]}
                active={isAccountItemActive(location.pathname, item.key, item.to)}
              >
                {t(`account:nav.${item.key}`)}
              </DropdownLink>
              {ACCOUNT_MENU_DIVIDERS.has(item.key) ? (
                <DropdownMenuSeparator className="mx-0 my-0" />
              ) : null}
            </Fragment>
          );
        })}
        <fetcher.Form method="post" action={storefrontPaths.logout(locale)}>
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

function AccountAvatar({
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

function formatBadgeCount(count: number | undefined): string | undefined {
  if (!count || count < 1) return undefined;
  return count > 99 ? '99+' : String(count);
}

function isAccountItemActive(pathname: string, key: AccountNavKey, to: string): boolean {
  if (pathname === to) return true;
  return key === 'bookings' && pathname.startsWith(`${to}/`);
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

function MobileAccountLinks({ locale }: { locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <>
      {accountNavItems(locale).map((item) => (
        <MobileNavLink key={item.key} to={item.to}>
          {t(`nav.${item.key}`)}
        </MobileNavLink>
      ))}
    </>
  );
}

function MobileNavLink({
  to,
  children,
  emphasized = false,
}: {
  to: string;
  children: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <SheetClose asChild>
      <NavLink
        to={to}
        prefetch="intent"
        className={
          emphasized
            ? 'flex items-center gap-2 rounded-sm px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10'
            : 'flex items-center gap-2 rounded-sm px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted'
        }
      >
        {children}
      </NavLink>
    </SheetClose>
  );
}

function LogoutForm({
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

function LocaleSwitcher({ current }: { current: Locale }) {
  const { t } = useTranslation(NsI18n.Navigation);
  const fetcher = useFetcher();
  const location = useLocation();
  const next: Locale = current === 'vi' ? 'en' : 'vi';
  const redirectTo = switchLocalePath(
    `${location.pathname}${location.search}${location.hash}`,
    next,
  );
  return (
    <fetcher.Form method="post" action="/set-locale">
      <input type="hidden" name="locale" value={next} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <Button
        type="submit"
        variant="ghost"
        className="h-auto justify-start rounded-sm px-3 py-2.5 text-sm font-semibold uppercase text-muted-foreground"
        aria-label={t('switchLanguage', { locale: next })}
      >
        {current}
      </Button>
    </fetcher.Form>
  );
}
