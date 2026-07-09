import type { ScopeLevel, ScopeMembership } from '@booking/shared';
import { Badge } from '@booking/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DASHBOARD_AREAS } from '~/lib/navigation';

/**
 * Placeholder area landing shown at each `_index` route. Wave-3 area agents
 * replace this with the real dashboard for their area.
 */
export function AreaOverview({
  scope,
  membership,
}: {
  scope: ScopeLevel;
  membership: ScopeMembership | null;
}) {
  const area = DASHBOARD_AREAS.find((a) => a.scope === scope);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{area?.title ?? 'Tổng quan'}</h1>
        <p className="text-muted-foreground">{area?.description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Vai trò</CardTitle>
            <CardDescription>Vai trò của bạn trong phạm vi này</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {membership && membership.roles.length > 0 ? (
              membership.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quyền hạn</CardTitle>
            <CardDescription>Số quyền được cấp trong phạm vi</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-semibold tabular-nums">
              {membership?.permissions.length ?? 0}
            </span>
          </CardContent>
        </Card>

        {membership && (membership.tenantName || membership.partnerName) ? (
          <Card>
            <CardHeader>
              <CardTitle>Phạm vi</CardTitle>
              <CardDescription>Đơn vị bạn đang quản lý</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {membership.tenantName ? <div>Tenant: {membership.tenantName}</div> : null}
              {membership.partnerName ? <div>Partner: {membership.partnerName}</div> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Các màn hình chi tiết sẽ được bổ sung trong các ticket tiếp theo.
      </p>
    </div>
  );
}
