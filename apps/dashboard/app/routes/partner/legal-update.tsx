import { redirect } from 'react-router';
import type { Route } from './+types/legal-update';
import { requirePartner } from '~/features/partner/server/partner.server';
import {
  fetchPendingLegalAcceptances,
  handleAcceptLegalAction,
} from '~/features/legal/server/legal.server';
import { LegalReacceptScreen } from '~/features/legal/components/legal-reaccept-screen';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Điều khoản cập nhật · BookingOS' }];
}

// This route's own loader re-checks `/me/legal/pending` (rather than trusting
// the layout's redirect) so a partner who lands here after already accepting
// — stale tab, back button — bounces home instead of showing an empty screen.
// It never redirects TO itself: the partner _layout.tsx loader skips its own
// pending check on this exact path, so there is no loop.
export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request);
  const res = await fetchPendingLegalAcceptances(auth);
  const pending = res.ok ? (res.data ?? []) : [];
  if (pending.length === 0) {
    throw redirect(dashboardPaths.partner.home);
  }
  return { pending, error: res.ok ? null : (res.error ?? 'Không tải được điều khoản cần đồng ý.') };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request);
  return handleAcceptLegalAction(request, auth, dashboardPaths.partner.home);
}

export default function PartnerLegalUpdate({ loaderData, actionData }: Route.ComponentProps) {
  // A failed accept (stale version, network error) returns `{ error }` from the
  // action instead of redirecting — surface that over the loader's own error.
  const error = actionData && 'error' in actionData ? actionData.error : loaderData.error;
  return <LegalReacceptScreen pending={loaderData.pending} error={error} />;
}
