import type { Locale } from '@booking/i18n';
import { Outlet, useLocation, useNavigation, useOutletContext } from 'react-router';
import {
  AccountContentSkeleton,
  type AccountContentSkeletonVariant,
} from '../../components/loading-skeletons';
import { AccountShell } from '../../features/account/components/account-shell';
import { requireAuth } from '../../lib/auth.server';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import type { StorefrontTenant } from '../../lib/tenant.server';
import { isReadNavigationMethod, useMinimumPending } from '../../lib/use-minimum-pending';
import type { StorefrontContext } from '../../root';
import type { Route } from './+types/layout';

export function meta() {
  return [{ title: 'Account | Bookify' }, { name: 'robots', content: 'noindex' }];
}

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale as Locale;
  const url = new URL(request.url);
  const auth = requireAuth(storefrontPaths.login(locale, `${url.pathname}${url.search}`));
  return { user: auth.info.user, locale };
}

export default function AccountLayout({ loaderData }: Route.ComponentProps) {
  const rootContext = useOutletContext<StorefrontContext>();
  const location = useLocation();
  const navigation = useNavigation();
  const { t } = useTranslation(NsI18n.Common);
  const skeletonVariant = accountSkeletonVariant(
    navigation.location?.pathname ?? location.pathname,
  );
  const pending = useMinimumPending(
    navigation.state === 'loading' &&
      navigation.location?.pathname !== location.pathname &&
      skeletonVariant !== null &&
      isReadNavigationMethod(navigation.formMethod),
  );
  const context: AccountOutletContext = {
    ...loaderData,
    tenant: rootContext.tenant,
    listingTypes: rootContext.listingTypes,
  };
  return (
    <AccountShell
      user={loaderData.user}
      locale={loaderData.locale}
      accountMenuSummary={rootContext.accountMenuSummary}
    >
      {pending && skeletonVariant ? (
        <AccountContentSkeleton label={t('loading')} variant={skeletonVariant} />
      ) : (
        <Outlet context={context} />
      )}
    </AccountShell>
  );
}

function accountSkeletonVariant(pathname: string): AccountContentSkeletonVariant | null {
  if (/\/account\/bookings\/[^/]+\/?$/.test(pathname)) return 'detail';
  if (/\/account\/(bookings|messages|reviews|favorites|recent)\/?$/.test(pathname)) {
    return 'list';
  }
  return null;
}

export interface AccountOutletContext extends ReturnType<typeof loader> {
  tenant: StorefrontTenant;
  listingTypes: StorefrontContext['listingTypes'];
}
