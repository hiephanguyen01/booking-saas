import type { ReactNode } from 'react';
import { Building2, Store } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { cn } from '@booking/ui/lib/utils';
import type { Route } from './+types/workspaces';
import { requireSessionInfo } from '~/lib/auth.server';
import { getCurrentDashboardHost } from '~/lib/request-auth.server';
import { adminHostOrigin } from '~/lib/tenant-host.server';
import { tenantMemberships, partnerMemberships } from '~/lib/workspace';

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
  const { info } = await requireSessionInfo(request);
  return {
    tenants: tenantMemberships(info).map((membership) => ({
      membership,
      href: membership.adminHostname ? adminHostOrigin(membership.adminHostname) : null,
    })),
    partners: partnerMemberships(info).map((membership) => ({
      membership,
      href: membership.adminHostname ? adminHostOrigin(membership.adminHostname) : null,
    })),
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
    <Card
      className={cn(
        'h-full transition-colors',
        href ? 'hover:border-primary/50' : 'opacity-60',
      )}
    >
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
        <p className="text-muted-foreground">Chọn khu vực tenant hoặc partner bạn muốn truy cập.</p>
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
      </div>
    </section>
  );
}
