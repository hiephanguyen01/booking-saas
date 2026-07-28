import { localeParam } from '~/constants/paths';
import { AccountRecentPage } from '~/features/account/components/recent/account-recent-page';
import { loadAccountRecentRoute } from '~/features/account/server/account-recent-route.server';
import type { Route } from './+types/recent';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = localeParam(params.locale);
  return loadAccountRecentRoute(request, locale);
}

export default function AccountRecentRoute(props: Route.ComponentProps) {
  return <AccountRecentPage {...props} />;
}
