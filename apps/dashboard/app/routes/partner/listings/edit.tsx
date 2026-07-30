import { data, redirect } from 'react-router';
import { Lock } from 'lucide-react';
import {
  updateListingInputSchema,
  type CancellationPolicyResponse,
  type ListingResponse,
  type ListingRevisionResponse,
  type ListingTypeResponse,
  type DepositRequirementResponse,
} from '@booking/contracts';
import type { Route } from './+types/edit';
import { apiDelete, apiGet, apiPatch } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { ListingStatusBadge } from '~/components/status-badge';
import { ListingForm } from '~/features/partner/components/listing-form';
import { PendingChangeBanner } from '~/features/partner/components/pending-change-banner';
import { applyRevisionDiff } from '~/features/partner/lib/listing-revision';

/**
 * A read-only strip above the edit form: current publish status + who last hid or
 * published it, so a partner opening a live/locked listing knows the state their
 * edit lands in (an admin-hidden listing can only be un-hidden by an admin).
 */
function ListingStatusStrip({ listing }: { listing: ListingResponse }) {
  const adminLocked = listing.status === 'archived' && listing.hiddenBy === 'admin';
  const actor = (who: 'partner' | 'admin'): string =>
    who === 'admin' ? 'quản trị viên' : 'đối tác';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
      <ListingStatusBadge status={listing.status} />
      {adminLocked ? (
        <span className="inline-flex items-center gap-1.5 text-warning">
          <Lock className="size-3.5" aria-hidden />
          Bị quản trị viên ẩn — chỉ quản trị viên mới bỏ ẩn được.
        </span>
      ) : listing.hiddenBy ? (
        <span className="text-muted-foreground">Đã ẩn bởi {actor(listing.hiddenBy)}.</span>
      ) : listing.status === 'draft' ? (
        <span className="text-muted-foreground">
          Bản nháp — thay đổi được lưu trực tiếp cho tới khi tin được duyệt lần đầu.
        </span>
      ) : (
        <span className="text-muted-foreground">
          Đã qua kiểm duyệt — mỗi thay đổi sẽ được gửi duyệt lại, bản đang hiển thị giữ nguyên.
        </span>
      )}
    </div>
  );
}

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sửa tin đăng · Đối tác · BookingOS' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const [listingRes, typesRes, policiesRes, revisionRes] = await Promise.all([
    apiGet<ListingResponse>(`/partner/listings/${params.listingId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
    apiGet<CancellationPolicyResponse[]>('/partner/cancellation-policies', auth),
    apiGet<ListingRevisionResponse | null>(
      `/partner/listings/${params.listingId}/revision`,
      auth,
    ),
  ]);
  if (!listingRes.ok || !listingRes.data) {
    throw new Response('Không tìm thấy tin đăng.', {
      status: listingRes.status === 403 ? 403 : 404,
    });
  }
  const requirementRes = await apiGet<DepositRequirementResponse>(
    '/partner/listings/deposit-requirement',
    auth,
    {
      query: {
        listingTypeId: listingRes.data.listingTypeId,
        categoryId: listingRes.data.categoryId ?? undefined,
      },
    },
  );
  const revision = revisionRes.ok ? (revisionRes.data ?? null) : null;
  return {
    listing: listingRes.data,
    // The form opens on the partner's waiting edit, not the approved version.
    formListing: applyRevisionDiff(listingRes.data, revision),
    revision,
    listingTypes: typesRes.data ?? [],
    cancellationPolicies: policiesRes.data ?? [],
    partnerId: membership.partnerId,
    minimumDepositPercent: requirementRes.ok
      ? (requirementRes.data?.minimumDepositPercent ?? null)
      : null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, can } = await requirePartner(request);
  if (!can('partner.listings.write')) {
    return data({ error: 'Không có quyền sửa tin đăng.', fieldErrors: null }, { status: 403 });
  }
  // The edit form posts JSON; the "huỷ thay đổi" button posts a form field.
  if (!request.headers.get('content-type')?.includes('application/json')) {
    const form = await request.formData();
    if (form.get('intent') === 'discard-revision') {
      const res = await apiDelete(`/partner/listings/${params.listingId}/revision`, auth);
      if (!res.ok) {
        return data({ error: res.error ?? 'Huỷ thay đổi không thành công.', fieldErrors: null }, {
          status: 400,
        });
      }
      return redirect(`/partner/listings/${params.listingId}/edit`);
    }
    return data({ error: 'Yêu cầu không hợp lệ.', fieldErrors: null }, { status: 400 });
  }
  const parsed = updateListingInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await apiPatch(`/partner/listings/${params.listingId}`, parsed.data, auth);
  if (!res.ok) {
    return data(
      { error: res.error ?? 'Lưu không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  }
  return redirect('/partner/listings');
}

export default function EditListingPage({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <div>
        <BackLink to="/partner/listings" label="Tin đăng" className="mb-2" />
        <PageHeader title="Sửa tin đăng" description={loaderData.listing.title} />
      </div>
      <ListingStatusStrip listing={loaderData.listing} />
      <PendingChangeBanner revision={loaderData.revision} />
      <ListingForm
        listingTypes={loaderData.listingTypes}
        partnerId={loaderData.partnerId}
        listing={loaderData.formListing}
        cancellationPolicies={loaderData.cancellationPolicies}
        minimumDepositPercent={loaderData.minimumDepositPercent}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
