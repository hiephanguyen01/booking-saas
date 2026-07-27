import type { ListingResponse, ListingReviewResponse, ListingTypeResponse } from '@booking/contracts';
import type { Route } from './+types/review';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { runModerationAction } from '~/features/tenant/server/moderation-action.server';
import { CONTACT_FIELD_LABEL, LISTING_CHECKLIST_LABEL } from '~/features/tenant/constants';
import { BackLink } from '~/components/back-link';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { ListingStatusBadge } from '~/components/status-badge';
import { useBusy } from '~/hooks/use-busy';
import { PartnerSummaryCard } from '~/features/tenant/components/moderation/partner-summary-card';
import { ModerationReviewPanel } from '~/features/tenant/components/moderation/moderation-review-panel';
import { ModerationActionsCard } from '~/features/tenant/components/moderation/moderation-actions-card';
import {
  ListingContentCard,
  ListingModerationLogCard,
} from '~/features/tenant/components/listing-review/listing-content-card';
import { ListingPricingCard } from '~/features/tenant/components/listing-review/listing-pricing-card';
import { ListingPolicyCard } from '~/features/tenant/components/listing-review/listing-policy-card';
import { ListingAttributesCard } from '~/features/tenant/components/listing-review/listing-attributes-card';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Kiểm duyệt tin đăng · Tenant · BookingOS' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const [listingRes, reviewRes] = await Promise.all([
    apiGet<ListingResponse>(`/tenant/listings/${params.listingId}`, auth),
    apiGet<ListingReviewResponse>(`/tenant/listings/${params.listingId}/review`, auth),
  ]);
  if (!reviewRes.ok || !reviewRes.data) {
    throw new Response(reviewRes.error ?? 'Không tìm thấy tin đăng', { status: reviewRes.status });
  }
  const listing = listingRes.ok ? listingRes.data : null;

  // The listing type carries the attribute LABELS; a secondary fetch that may
  // fail independently, so the attribute section degrades to raw keys rather
  // than 500-ing the whole review page.
  let listingType: ListingTypeResponse | null = null;
  let listingTypeFailed = false;
  if (listing) {
    const typeRes = await apiGet<ListingTypeResponse>(
      `/tenant/listing-types/${listing.listingTypeId}`,
      auth,
    );
    if (typeRes.ok && typeRes.data) listingType = typeRes.data;
    else listingTypeFailed = true;
  }

  return { listing, review: reviewRes.data, listingType, listingTypeFailed };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  return runModerationAction({
    form: await request.formData(),
    auth,
    basePath: `/tenant/listings/${params.listingId}`,
    intents: ['publish', 'republish', 'hide'],
    contactLeakMessage:
      'Tin đăng còn lộ thông tin liên hệ. Tích “Bỏ qua kiểm tra” để xuất bản bất chấp cảnh báo.',
    redirectTo: '/tenant/listings',
  });
}

export default function ReviewListing({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, review, listingType, listingTypeFailed } = loaderData;
  const busy = useBusy();

  const hasContactLeak = review.contactFlags.length > 0;
  const canPublish = review.checklistPassed && !hasContactLeak;

  return (
    <div className="space-y-6">
      <BackLink to="/tenant/listings" label="Danh sách tin đăng" />

      <PageHeader
        title={listing?.title ?? 'Kiểm duyệt tin đăng'}
        description={listing ? `/${listing.slug}` : undefined}
        actions={<ListingStatusBadge status={review.status} />}
      />

      <ErrorBanner error={actionData?.error} />
      <ErrorBanner
        error={
          listing ? null : 'Không tải được chi tiết tin đăng — chỉ hiển thị checklist kiểm duyệt.'
        }
      />

      {listing ? (
        <PartnerSummaryCard
          partnerId={listing.partnerId}
          partner={listing.partner}
          description="Chủ sở hữu tin đăng đang được kiểm duyệt."
        />
      ) : null}

      <ModerationReviewPanel
        checklist={review.checklist}
        checklistPassed={review.checklistPassed}
        contactFlags={review.contactFlags}
        checklistLabels={LISTING_CHECKLIST_LABEL}
        fieldLabel={(field) => CONTACT_FIELD_LABEL[field] ?? field}
        scanDescription="Chống lách sàn (§7.3)"
      />

      {listing ? <ListingContentCard listing={listing} type={listingType} /> : null}
      {listing ? <ListingPricingCard listing={listing} /> : null}
      {listing ? <ListingPolicyCard listing={listing} /> : null}
      {listing ? (
        <ListingAttributesCard listing={listing} type={listingType} typeFailed={listingTypeFailed} />
      ) : null}
      {listing ? <ListingModerationLogCard listing={listing} /> : null}

      <ModerationActionsCard
        entityLabel="tin đăng"
        cardDescription="Quyết định sẽ được ghi vào nhật ký kiểm duyệt."
        status={review.status}
        hiddenBy={listing?.hiddenBy ?? null}
        managedByGroupHref={
          listing?.groupId ? `/tenant/listing-groups/${listing.groupId}/review` : null
        }
        canPublish={canPublish}
        hasContactLeak={hasContactLeak}
        supportsRepublish
        publishDescription="Tin đăng sẽ hiển thị công khai trên storefront và bắt đầu nhận đặt chỗ."
        hidePublishedDescription="Tin đăng sẽ bị gỡ khỏi storefront ngay lập tức và ngừng nhận đặt chỗ mới. Lý do được lưu vào nhật ký kiểm duyệt."
        busy={busy}
      />
    </div>
  );
}
