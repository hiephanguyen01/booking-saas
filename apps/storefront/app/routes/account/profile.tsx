import { AccountProfilePage } from '~/features/account/components/profile-page';
import {
  handleAccountProfileAction,
  loadAccountProfileRoute,
} from '~/features/account/server/profile-route.server';
import type { Route } from './+types/profile';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return loadAccountProfileRoute(request, locale);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return handleAccountProfileAction(request, locale);
}

export default function ProfileRoute({ actionData }: Route.ComponentProps) {
  return <AccountProfilePage actionData={actionData} />;
}
