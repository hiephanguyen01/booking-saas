import {
  contentReportResponseSchema,
  updateContentReportInputSchema,
  type ContentReportReason,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { data, Link } from 'react-router';
import type { Route } from './+types/detail';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { dashboardPaths } from '~/constants/paths';
import { StatusBadge } from '~/features/content-reports/components/content-report-inbox';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiGet, apiPatch } from '~/lib/api.server';
import { formatDateTime } from '~/lib/format';

const reasonLabels: Record<ContentReportReason, string> = {
  misleading: 'Thông tin sai lệch hoặc gây hiểu nhầm',
  fraud_or_scam: 'Có dấu hiệu lừa đảo',
  prohibited_content: 'Nội dung không phù hợp hoặc bị cấm',
  contact_or_off_platform: 'Kêu gọi liên hệ hoặc thanh toán ngoài nền tảng',
  duplicate_or_spam: 'Trùng lặp hoặc spam',
  other: 'Lý do khác',
};

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết báo cáo · Tenant · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const result = await apiGet(`/tenant/content-reports/${params.reportId}`, auth, {
    schema: contentReportResponseSchema,
  });
  if (!result.ok || !result.data)
    throw new Response('Không tìm thấy báo cáo', { status: result.status || 404 });
  return { report: result.data };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const parsed = updateContentReportInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return data(
      { saved: false as const, error: null, fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  const result = await apiPatch(`/tenant/content-reports/${params.reportId}`, parsed.data, auth, {
    schema: contentReportResponseSchema,
  });
  if (!result.ok)
    return data(
      {
        saved: false as const,
        error: result.error ?? 'Không thể cập nhật báo cáo.',
        fieldErrors: null,
      },
      { status: result.status || 400 },
    );
  return data({ saved: true as const, error: null, fieldErrors: null });
}

export default function ContentReportDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { report } = loaderData;
  const targetHref =
    report.target === 'listing'
      ? `/tenant/listings/${encodeURIComponent(report.targetId)}/review`
      : `/tenant/listing-groups/${encodeURIComponent(report.targetId)}/review`;
  return (
    <div className="space-y-6">
      <BackLink to={dashboardPaths.tenant.contentReports} label="Danh sách báo cáo" />
      <PageHeader
        title={report.targetTitle}
        description={`Báo cáo lúc ${formatDateTime(report.createdAt)}`}
        actions={<StatusBadge status={report.status} />}
      />
      <ErrorBanner error={actionData?.error} />
      <SuccessBanner message={actionData?.saved ? 'Đã cập nhật trạng thái báo cáo.' : null} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nội dung báo cáo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-xs text-muted-foreground">Lý do</p>
                <Badge variant="outline" className="mt-2">
                  {reasonLabels[report.reason]}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mô tả của khách hàng</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {report.details || 'Không có mô tả bổ sung.'}
                </p>
              </div>
              <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
                <Info label="Người báo cáo" value={report.reporterName} />
                <Info label="Nhà cung cấp" value={report.partnerName} />
                <Info
                  label="Loại bài"
                  value={report.target === 'listing' ? 'Tin đăng' : 'Tin nhiều hạng mục'}
                />
                <Info label="Slug tại thời điểm báo cáo" value={`/${report.targetSlug}`} />
              </div>
              <Button asChild variant="outline">
                <Link to={targetHref}>Mở màn hình kiểm duyệt bài</Link>
              </Button>
            </CardContent>
          </Card>
          {report.resolutionNote ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Kết quả xử lý gần nhất</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6">{report.resolutionNote}</p>
                {report.handledAt ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {formatDateTime(report.handledAt)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle className="text-base">Cập nhật xử lý</CardTitle>
          </CardHeader>
          <CardContent>
            <GenericForm
              schema={updateContentReportInputSchema}
              fields={[
                {
                  name: 'status',
                  type: 'select',
                  label: 'Trạng thái',
                  required: true,
                  options: [
                    { value: 'open', label: 'Mới' },
                    { value: 'reviewing', label: 'Đang xem xét' },
                    { value: 'resolved', label: 'Đã xử lý' },
                    { value: 'dismissed', label: 'Bỏ qua' },
                  ],
                },
                {
                  name: 'resolutionNote',
                  type: 'textarea',
                  rows: 5,
                  label: 'Ghi chú xử lý',
                  placeholder: 'Nêu quyết định và căn cứ xử lý…',
                },
              ]}
              defaultValues={{ status: report.status, resolutionNote: report.resolutionNote ?? '' }}
              submitLabel="Lưu trạng thái"
              submitPendingLabel="Đang lưu…"
              serverError={actionData?.error}
              fieldErrors={actionData?.fieldErrors}
              submitFullWidth
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
