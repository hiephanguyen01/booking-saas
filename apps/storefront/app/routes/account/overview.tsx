import { AccountOverviewPage } from '~/features/account/components/overview/account-overview-page';
import { loadAccountOverviewRoute } from '~/features/account/server/account-overview-route.server';
import { localeParam } from '~/constants/paths';
import { ACCOUNT_MOBILE_CHROME_HANDLE } from '~/features/site-shell/lib/site-header-handle';
import type { Route } from './+types/overview';

export const handle = ACCOUNT_MOBILE_CHROME_HANDLE;

export function loader({ request, params }: Route.LoaderArgs) {
  return loadAccountOverviewRoute(request, localeParam(params.locale));
}

export default function AccountOverviewRoute({ loaderData }: Route.ComponentProps) {
  return <AccountOverviewPage stats={loaderData.stats} />;
}
