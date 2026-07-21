import type { ListingGroupDetailResponse, ListingGroupReviewResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import type { Route } from './+types/review';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { runModerationAction } from '~/features/tenant/server/moderation-action.server';
import { CONTACT_FIELD_LABEL, GROUP_CHECKLIST_LABEL } from '~/features/tenant/constants';
import { BackLink } from '~/components/back-link';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { ListingStatusBadge } from '~/components/status-badge';
import { WarningCallout } from '~/components/warning-callout';
import { useBusy } from '~/hooks/use-busy';
import { PartnerSummaryCard } from '~/features/tenant/components/moderation/partner-summary-card';
import { ModerationReviewPanel } from '~/features/tenant/components/moderation/moderation-review-panel';
import { ModerationActionsCard } from '~/features/tenant/components/moderation/moderation-actions-card';
import { ChildListingCard } from '~/features/tenant/components/group-review/child-listing-card';
import { GroupContentCard } from '~/features/tenant/components/group-review/group-content-card';

/** Contact-scan field names are namespaced for children (`listings[0].description`). */
function contactFieldLabel(field: string): string {
  const match = field.match(/^listings\[(\d+)\]\.(.+)$/);
  if (match) {
    const sub = CONTACT_FIELD_LABEL[match[2]] ?? match[2];
    return `Hạng mục ${Number(match[1]) + 1} · ${sub}`;
  }
  return CONTACT_FIELD_LABEL[field] ?? field;
}

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Kiểm duyệt tin đăng · Tenant · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.listings.read');
  const [detailRes, reviewRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/tenant/listing-groups/${params.groupId}/detail`, auth),
    // The review endpoint requires `tenant.listings.publish`; a read-only user
    // (or a transient failure) gets no checklist rather than a broken page.
    apiGet<ListingGroupReviewResponse>(`/tenant/listing-groups/${params.groupId}/review`, auth),
  ]);
  if (!detailRes.ok || !detailRes.data) {
    throw new Response('Không tìm thấy tin đăng.', { status: detailRes.status });
  }
  return {
    group: detailRes.data,
    review: reviewRes.ok ? (reviewRes.data ?? null) : null,
    reviewFailed: !reviewRes.ok,
    canModerate: can('tenant.listings.publish'),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  return runModerationAction({
    form: await request.formData(),
    auth,
    basePath: `/tenant/listing-groups/${params.groupId}`,
    intents: ['publish', 'republish', 'hide'],
    contactLeakMessage:
      'Tin đăng còn lộ thông tin liên hệ. Tích “Bỏ qua kiểm tra” để xuất bản bất chấp cảnh báo.',
    redirectTo: '/tenant/listing-groups',
  });
}

export default function ListingGroupReviewPage({ loaderData, actionData }: Route.ComponentProps) {
  const { group, review, reviewFailed, canModerate } = loaderData;
  const busy = useBusy();

  const partner = group.listings[0]?.partner ?? null;
  const canPublish = review ? review.checklistPassed && review.contactFlags.length === 0 : false;

  return (
    <div className="space-y-6">
      <BackLink to="/tenant/listing-groups" label="Tin đăng" />

      <PageHeader
        title={group.title}
        description={`/${group.slug} · ${group.listingCount} ${group.itemLabel}`}
        actions={<ListingStatusBadge status={group.status} />}
      />

      <ErrorBanner error={actionData?.error} />

      <PartnerSummaryCard
        partnerId={group.partnerId}
        partner={partner}
        description="Chủ sở hữu tin đăng này."
      />

      {review ? (
        <ModerationReviewPanel
          checklist={review.checklist}
          checklistPassed={review.checklistPassed}
          contactFlags={review.contactFlags}
          checklistLabels={GROUP_CHECKLIST_LABEL}
          fieldLabel={contactFieldLabel}
          scanDescription="Gồm cả nội dung từng hạng mục (§7.3)"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Kiểm duyệt</CardTitle>
          </CardHeader>
          <CardContent>
            <WarningCallout>
              {reviewFailed ? 'Không tải được checklist kiểm duyệt.' : 'Không có dữ liệu kiểm duyệt.'}
            </WarningCallout>
          </CardContent>
        </Card>
      )}

      <GroupContentCard group={group} />

      <Card>
        <CardHeader>
          <CardTitle className="capitalize">{group.itemLabel}</CardTitle>
          <CardDescription>
            {group.readyListingCount}/{group.listingCount} hạng mục đạt mức hoàn thiện cơ bản.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {group.listings.length > 0 ? (
            group.listings.map((listing) => <ChildListingCard key={listing.id} listing={listing} />)
          ) : (
            <p className="text-sm text-muted-foreground">Tin đăng chưa có hạng mục nào.</p>
          )}
        </CardContent>
      </Card>

      {canModerate ? (
        <ModerationActionsCard
          entityLabel="tin đăng"
          cardDescription="Áp dụng cho tin đăng và toàn bộ hạng mục; ghi vào nhật ký kiểm duyệt."
          status={group.status}
          hiddenBy={group.hiddenBy}
          canPublish={canPublish}
          hasContactLeak={(review?.contactFlags.length ?? 0) > 0}
          reviewUnverified={reviewFailed}
          supportsRepublish
          publishDescription="Tin đăng và toàn bộ hạng mục sẽ hiển thị công khai trên storefront."
          hidePublishedDescription="Tin đăng và toàn bộ hạng mục sẽ bị gỡ khỏi storefront ngay lập tức. Lý do được lưu vào nhật ký kiểm duyệt."
          busy={busy}
        />
      ) : null}
    </div>
  );
}
