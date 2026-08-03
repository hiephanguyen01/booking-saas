import { redirect } from 'react-router';
import type { Route } from './+types/legal-update';
import { requireAffiliate } from '~/features/affiliate/server/affiliate.server';
import {
  fetchPendingLegalAcceptances,
  handleAcceptLegalAction,
} from '~/features/legal/server/legal.server';
import { LegalReacceptScreen } from '~/features/legal/components/legal-reaccept-screen';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Điều khoản cập nhật · BookingOS' }];
}

// Mirrors routes/partner/legal-update.tsx. This route's own loader re-checks
// apiPaths.me.legalPending rather than trusting the layout's redirect, and the
// affiliate _layout.tsx loader skips its own pending check on this exact
// path — so there is no redirect loop between the two.
export async function loader({ request }: Route.LoaderArgs) {
  const { auth, active } = await requireAffiliate(request);
  if (!active) {
    // Nothing approved to accept terms for — send them to the portal's own
    // "chưa có tài khoản cộng tác viên" state instead of an empty screen.
    throw redirect(dashboardPaths.affiliate.home);
  }
  const res = await fetchPendingLegalAcceptances(auth);
  const pending = res.ok ? (res.data ?? []) : [];
  if (pending.length === 0) {
    throw redirect(dashboardPaths.affiliate.home);
  }
  return { pending, error: res.ok ? null : (res.error ?? 'Không tải được điều khoản cần đồng ý.') };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireAffiliate(request);
  return handleAcceptLegalAction(request, auth, dashboardPaths.affiliate.home);
}

export default function AffiliateLegalUpdate({ loaderData, actionData }: Route.ComponentProps) {
  // A failed accept (stale version, network error) returns `{ error }` from the
  // action instead of redirecting — surface that over the loader's own error.
  const error = actionData && 'error' in actionData ? actionData.error : loaderData.error;
  return <LegalReacceptScreen pending={loaderData.pending} error={error} />;
}
