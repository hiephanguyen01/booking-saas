import type { Locale } from '@booking/i18n';
import { Outlet, useOutletContext } from 'react-router';
import { AccountShell } from '../../features/account/components/account-shell';
import { requireAuth } from '../../lib/auth.server';
import { storefrontPaths } from '../../lib/locale-paths';
import type { StorefrontTenant } from '../../lib/tenant.server';
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
      <Outlet context={context} />
    </AccountShell>
  );
}

export interface AccountOutletContext extends ReturnType<typeof loader> {
  tenant: StorefrontTenant;
  listingTypes: StorefrontContext['listingTypes'];
}
