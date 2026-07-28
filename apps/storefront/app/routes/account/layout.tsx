import { Outlet } from 'react-router';
import { AccountContentSkeleton } from '~/components/loading-skeletons';
import { AccountShell } from '~/features/account/components/account-shell/account-shell';
import { getAccountMenuSummary } from '~/features/account/server/account-menu.server';
import { requireAuth } from '~/lib/auth.server';
import { requireLocale } from '~/lib/i18n.server';
import { storefrontPaths } from '~/constants/paths';
import { useAccountLayoutController } from '~/features/account/hooks/use-account-layout-controller';
import type { Route } from './+types/layout';

export type { AccountOutletContext } from '~/features/account/hooks/use-account-layout-controller';

export function meta() {
  return [{ title: 'Account | BookingOS' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = requireLocale(params.locale);
  const url = new URL(request.url);
  const auth = requireAuth(storefrontPaths.login(locale, `${url.pathname}${url.search}`));
  const accountMenuSummary = await getAccountMenuSummary(request, auth.session.accessToken);
  return { user: auth.info.user, locale, accountMenuSummary };
}

export default function AccountLayout({ loaderData }: Route.ComponentProps) {
  const { accountMenuSummary, context, loadingLabel, pending, skeletonVariant } =
    useAccountLayoutController(loaderData);

  return (
    <AccountShell
      user={loaderData.user}
      locale={loaderData.locale}
      accountMenuSummary={accountMenuSummary}
    >
      {pending && skeletonVariant ? (
        <AccountContentSkeleton label={loadingLabel} variant={skeletonVariant} />
      ) : (
        <Outlet context={context} />
      )}
    </AccountShell>
  );
}
