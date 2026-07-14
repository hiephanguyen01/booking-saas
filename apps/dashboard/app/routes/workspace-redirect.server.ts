import { redirect } from 'react-router';
import { requireSessionInfo } from '~/lib/auth.server';
import { dashboardPaths } from '~/lib/paths';
import { preferredPartnerMembership, preferredTenantMembership } from '~/lib/workspace';

function sameOriginRefererPath(request: Request, url: URL): string | null {
  const value = request.headers.get('Referer');
  if (!value) return null;
  try {
    const referer = new URL(value);
    return referer.origin === url.origin ? referer.pathname : null;
  } catch {
    return null;
  }
}

export async function redirectLegacyWorkspace(
  request: Request,
  url: URL,
  suffixValue: string | undefined,
) {
  const { info } = await requireSessionInfo(request);
  const suffix = suffixValue ? `/${suffixValue}` : '';
  const refererPath = sameOriginRefererPath(request, url);

  if (url.pathname === '/tenant' || url.pathname.startsWith('/tenant/')) {
    const membership = preferredTenantMembership(info, refererPath);
    if (!membership) throw new Response('Không tìm thấy tenant.', { status: 404 });
    throw redirect(`${dashboardPaths.tenant.home(membership.tenantId)}${suffix}`, { status: 302 });
  }

  const membership = preferredPartnerMembership(info, refererPath);
  if (!membership) throw new Response('Không tìm thấy partner.', { status: 404 });
  throw redirect(`${dashboardPaths.partner.home(membership.partnerId)}${suffix}`, { status: 302 });
}
