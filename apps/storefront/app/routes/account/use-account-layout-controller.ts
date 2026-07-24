import type { CurrentUser } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { useLocation, useNavigation, useOutletContext } from 'react-router';
import type { AccountContentSkeletonVariant } from '../../components/loading-skeletons';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { StorefrontTenant } from '../../lib/tenant.server';
import { isReadNavigationMethod, useMinimumPending } from '../../lib/use-minimum-pending';
import type { StorefrontContext } from '../../root';

export interface AccountLayoutLoaderData {
  user: CurrentUser;
  locale: Locale;
}

export interface AccountOutletContext extends AccountLayoutLoaderData {
  tenant: StorefrontTenant;
  listingTypes: StorefrontContext['listingTypes'];
}

export function useAccountLayoutController(loaderData: AccountLayoutLoaderData) {
  const rootContext = useOutletContext<StorefrontContext>();
  const location = useLocation();
  const navigation = useNavigation();
  const { t } = useTranslation(NsI18n.Common);
  const targetPathname = navigation.location?.pathname ?? location.pathname;
  const skeletonVariant = accountSkeletonVariant(targetPathname);
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

  return {
    accountMenuSummary: rootContext.accountMenuSummary,
    context,
    loadingLabel: t('loading'),
    pending,
    skeletonVariant,
  };
}

function accountSkeletonVariant(pathname: string): AccountContentSkeletonVariant | null {
  if (/\/account\/bookings\/[^/]+\/?$/.test(pathname)) return 'detail';
  if (/\/account\/(bookings|messages|reviews|favorites|recent)\/?$/.test(pathname)) {
    return 'list';
  }
  return null;
}
