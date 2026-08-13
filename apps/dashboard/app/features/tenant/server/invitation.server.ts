import { redirect } from 'react-router';
import { tenantInvitationPreviewSchema, type TenantInvitationPreview } from '@booking/contracts';
import { apiGet, apiPost, type ApiAuth, type ApiResult } from '~/lib/api.server';
import { getOptionalUser, loadSessionInfo } from '~/lib/auth.server';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';

export interface InvitationRecipient {
  auth: ApiAuth;
  /** The signed-in account's own email, for the mismatch screen's copy. */
  currentEmail: string;
}

/**
 * Guards `/invitations/:token`. Deliberately NOT `requireTenant` (or any
 * scope guard): the whole point of this screen is that its visitor may hold
 * no membership anywhere yet — see `routes.ts`'s comment on why this route
 * sits outside `/tenant`. Only a signed-in account is required; an anonymous
 * visitor is bounced to login with `redirectTo` pointed back at this exact
 * URL (honoured by `routes/auth/login.tsx`), so accepting the invitation is
 * what they land on next, not the platform's generic "no access" home.
 */
export async function requireInvitationRecipient(
  request: Request,
  token: string,
): Promise<InvitationRecipient> {
  const user = await getOptionalUser(request);
  if (!user) {
    const redirectTo = encodeURIComponent(dashboardPaths.invitationAccept(token));
    throw redirect(`${dashboardPaths.auth.login}?redirectTo=${redirectTo}`);
  }
  // Set together by the auth middleware (see auth-middleware.server.ts) — `info`
  // is never absent when `user` is present.
  const info = await loadSessionInfo(request);
  return { auth: { token: user.accessToken }, currentEmail: info?.user.email ?? '' };
}

/** `GET /auth/invitations/:token` — the recipient's read-only preview. */
export function fetchInvitationPreview(
  auth: ApiAuth,
  token: string,
): Promise<ApiResult<TenantInvitationPreview>> {
  return apiGet<TenantInvitationPreview>(apiPaths.auth.invitation(token), auth, {
    schema: tenantInvitationPreviewSchema,
  });
}

/** `POST /auth/invitations/:token/accept` — 204 on success. */
export function acceptInvitation(auth: ApiAuth, token: string): Promise<ApiResult<void>> {
  return apiPost<void>(apiPaths.auth.invitationAccept(token), {}, auth);
}
