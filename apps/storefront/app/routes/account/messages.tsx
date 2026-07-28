import { AccountMessagesPage } from '~/features/account/components/account-messages-page';
import { loadAccountMessagesRoute } from '~/features/account/server/account-messages-route.server';
import type { Route } from './+types/messages';

export function loader({ params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return loadAccountMessagesRoute(locale);
}

export default function AccountMessagesRoute(props: Route.ComponentProps) {
  return <AccountMessagesPage {...props} />;
}
