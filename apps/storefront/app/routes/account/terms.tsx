import { localeParam } from '~/constants/paths';
import { MyAcceptancesPage } from '~/features/account/components/legal/my-acceptances-page';
import { loadAccountTermsRoute } from '~/features/account/server/account-terms-route.server';
import type { Route } from './+types/terms';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = localeParam(params.locale);
  return loadAccountTermsRoute(request, locale);
}

export default function AccountTermsRoute(props: Route.ComponentProps) {
  return <MyAcceptancesPage {...props} />;
}
