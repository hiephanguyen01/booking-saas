import type { ReactNode } from 'react';
import { Building2, Share2, Store } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { cn } from '@booking/ui/lib/utils';
import {
  publicTenantResponseSchema,
  type AffiliateResponse,
  type PublicTenantResponse,
} from '@booking/contracts';
import type { Route } from './+types/workspaces';
import { requireSessionInfo } from '~/lib/auth.server';
import { getCurrentDashboardHost } from '~/lib/request-auth.server';
import { adminHostOrigin } from '~/lib/tenant-host.server';
import { tenantMemberships, partnerMemberships } from '~/lib/workspace';
import { apiGet, apiPublicGet } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';

/**
 * An affiliate's console link needs its own resolution, unlike the tenant/
 * partner cards below: `AffiliateResponse` carries `tenantHostname`, but that
 * is the tenant's STOREFRONT host (the origin a referral link points at, per
 * its own doc comment) — not a console host. There is also no RBAC-scope
 * `ScopeMembership` to read an `adminHostname` off, because affiliates are
 * deliberately not an RBAC scope: a user can hold an approved affiliate row
 * for a tenant they have no tenant/partner role in at all.
 *
 * So this resolves the console host the same way the storefront's own
 * partner/affiliate CTA does (`apps/storefront/app/lib/server/tenant.server.ts`
 * → `tenantDashboardOrigin`): call the public storefront tenant-resolution
 * endpoint with the storefront hostname spoofed onto `x-forwarded-host`, and
 * read `adminHostname` off its response. That endpoint is `@Public()` and was
 * built for exactly this cross-link purpose (see its schema doc comment) —
 * no new API surface needed. Null (no verified console domain, or the lookup
 * fails) renders the card disabled, same as a tenant/partner membership with
 * no `adminHostname`.
 */
async function resolveAffiliateHref(
  membership: AffiliateResponse,
  signal: AbortSignal,
): Promise<string | null> {
  if (!membership.tenantHostname) return null;
  const result = await apiPublicGet<PublicTenantResponse>(apiPaths.public.tenant, {
    schema: publicTenantResponseSchema,
    headers: { 'x-forwarded-host': membership.tenantHostname },
    signal,
  });
  const adminHostname = result.ok ? (result.data?.adminHostname ?? null) : null;
  return adminHostname ? adminHostOrigin(adminHostname) : null;
}

/**
 * Resolves each membership's console `href` here, in the loader — not in the
 * component — because building it reads `DASHBOARD_PORT` (`adminHostOrigin`),
 * and a component may never read `process.env`. A `null` `adminHostname`
 * (no verified console domain yet) becomes a `null` href; the card renders
 * disabled rather than link to nowhere.
 */
export async function loader({ request }: Route.LoaderArgs) {
  if (getCurrentDashboardHost().kind !== 'platform') {
    throw new Response('Không tìm thấy trang.', { status: 404 });
  }
  const { user, info } = await requireSessionInfo(request);

  // Affiliates are NOT an RBAC scope (see affiliate.server.ts's requireAffiliate),
  // so they never appear in `info.scopes` — an affiliate-only user would
  // otherwise land here to a page listing nothing, with no way onward.
  const affiliateRes = await apiGet<AffiliateResponse[]>(
    apiPaths.affiliate.me,
    { token: user.accessToken },
    { signal: request.signal },
  );
  const approvedAffiliates = (affiliateRes.ok ? (affiliateRes.data ?? []) : []).filter(
    (membership) => membership.status === 'approved',
  );
  const affiliates = await Promise.all(
    approvedAffiliates.map(async (membership) => ({
      membership,
      href: await resolveAffiliateHref(membership, request.signal),
    })),
  );

  return {
    tenants: tenantMemberships(info).map((membership) => ({
      membership,
      href: membership.adminHostname ? adminHostOrigin(membership.adminHostname) : null,
    })),
    partners: partnerMemberships(info).map((membership) => ({
      membership,
      href: membership.adminHostname ? adminHostOrigin(membership.adminHostname) : null,
    })),
    affiliates,
  };
}

function WorkspaceCard({
  icon,
  title,
  subtitle,
  href,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  href: string | null;
}) {
  const card = (
    <Card className={cn('h-full transition-colors', href && 'hover:border-primary/50')}>
      <CardHeader className="flex-row items-center gap-3">
        {icon}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {href ? subtitle : 'Chưa cấu hình tên miền quản trị'}
      </CardContent>
    </Card>
  );
  return href ? <a href={href}>{card}</a> : card;
}

export default function Workspaces({ loaderData }: Route.ComponentProps) {
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chọn không gian làm việc</h1>
        <p className="text-muted-foreground">
          Chọn khu vực tenant, partner hoặc cộng tác viên bạn muốn truy cập.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {loaderData.tenants.map(({ membership, href }) => (
          <WorkspaceCard
            key={`tenant:${membership.tenantId}`}
            icon={<Building2 className="size-5" />}
            title={membership.tenantName ?? 'Tenant'}
            subtitle="Tenant workspace"
            href={href}
          />
        ))}
        {loaderData.partners.map(({ membership, href }) => (
          <WorkspaceCard
            key={`partner:${membership.partnerId}`}
            icon={<Store className="size-5" />}
            title={membership.partnerName ?? 'Partner'}
            subtitle={membership.tenantName ?? 'Partner workspace'}
            href={href}
          />
        ))}
        {loaderData.affiliates.map(({ membership, href }) => (
          <WorkspaceCard
            key={`affiliate:${membership.id}`}
            icon={<Share2 className="size-5" />}
            title={membership.tenantName}
            subtitle="Không gian cộng tác viên"
            href={href}
          />
        ))}
      </div>
    </section>
  );
}
