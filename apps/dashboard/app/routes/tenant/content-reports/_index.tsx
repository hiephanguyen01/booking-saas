import { contentReportListResponseSchema } from '@booking/contracts';
import type { Route } from './+types/_index';
import { ContentReportInbox } from '~/features/content-reports/components/content-report-inbox';
import { CONTENT_REPORT_FILTER_SPEC } from '~/features/content-reports/lib/content-report-filters';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiGet } from '~/lib/api.server';
import { readListFilters } from '~/lib/list-filters';
import { readListParams } from '~/lib/pagination';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Báo cáo nội dung · Tenant · BookingOS' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const list = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, CONTENT_REPORT_FILTER_SPEC);
  const status = url.searchParams.get('status') || 'all';
  const result = await apiGet('/tenant/content-reports', auth, {
    query: list.toApiQuery({ ...apiFilters, status }),
    schema: contentReportListResponseSchema,
  });
  return {
    result: result.ok ? result.data : null,
    filters,
    error: result.ok ? null : (result.error ?? 'Không tải được báo cáo nội dung.'),
  };
}

export default function TenantContentReports({ loaderData }: Route.ComponentProps) {
  return (
    <ContentReportInbox
      result={loaderData.result}
      error={loaderData.error}
      filters={loaderData.filters}
    />
  );
}
