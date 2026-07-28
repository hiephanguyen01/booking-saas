import { AccountRecentPage } from '~/features/account/components/account-recent-page';
import { loadAccountRecentRoute } from '~/features/account/server/account-recent-route.server';
import type { Route } from './+types/recent';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return loadAccountRecentRoute(request, locale);
}

export default function AccountRecentRoute(props: Route.ComponentProps) {
  return <AccountRecentPage {...props} />;
}
