import { localeParam } from '~/constants/paths';
import { AccountMessagesPage } from '~/features/account/components/messages/account-messages-page';
import { loadAccountMessagesRoute } from '~/features/account/server/account-messages-route.server';
import type { Route } from './+types/messages';

export function loader({ params }: Route.LoaderArgs) {
  const locale = localeParam(params.locale);
  return loadAccountMessagesRoute(locale);
}

export default function AccountMessagesRoute(props: Route.ComponentProps) {
  return <AccountMessagesPage {...props} />;
}
