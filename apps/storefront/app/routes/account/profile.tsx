import { localeParam } from '~/constants/paths';
import { AccountProfilePage } from '~/features/account/components/profile/profile-page';
import {
  handleAccountProfileAction,
  loadAccountProfileRoute,
} from '~/features/account/server/profile-route.server';
import type { Route } from './+types/profile';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = localeParam(params.locale);
  return loadAccountProfileRoute(request, locale);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = localeParam(params.locale);
  return handleAccountProfileAction(request, locale);
}

export default function ProfileRoute({ actionData }: Route.ComponentProps) {
  return <AccountProfilePage actionData={actionData} />;
}
