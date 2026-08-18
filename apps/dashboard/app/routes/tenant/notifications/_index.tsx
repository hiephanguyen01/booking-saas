import { useFetcher, useSearchParams } from 'react-router';
import type { Route } from './+types/_index';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { NotificationList } from '~/features/notifications/components/notification-list';
import { loadNotifications } from '~/features/notifications/server/notifications.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { readListParams } from '~/lib/pagination';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Thông báo · Tenant · BookingOS' }];
}

// No permission argument: an inbox is the caller's own mail, not an RBAC
// resource, so every tenant member reads it — not gated by a permission key.
export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request);
  const list = readListParams(url.searchParams);
  return loadNotifications(auth, 'tenant', list.page, list.pageSize, request.signal);
}

export default function TenantNotificationsPage({ loaderData }: Route.ComponentProps) {
  const action = useFetcher();
  const [searchParams] = useSearchParams();
  const list = readListParams(searchParams);

  return (
    <div className="space-y-4">
      <PageHeader title="Thông báo" />
      <div className="overflow-hidden rounded-lg border">
        <NotificationList
          items={loaderData.items}
          onRead={(id) =>
            action.submit({ intent: 'read', id }, { method: 'post', action: '/notifications' })
          }
        />
      </div>
      <PaginationBar
        page={loaderData.page}
        pageSize={loaderData.pageSize}
        total={loaderData.total}
        hrefFor={list.pageHref}
      />
    </div>
  );
}
