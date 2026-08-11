import { AccountOverviewPage } from '~/features/account/components/overview/account-overview-page';
import { loadAccountOverviewRoute } from '~/features/account/server/account-overview-route.server';
import { localeParam } from '~/constants/paths';
import type { Route } from './+types/overview';

export function loader({ request, params }: Route.LoaderArgs) {
  return loadAccountOverviewRoute(request, localeParam(params.locale));
}

export default function AccountOverviewRoute({ loaderData }: Route.ComponentProps) {
  return <AccountOverviewPage stats={loaderData.stats} />;
}
