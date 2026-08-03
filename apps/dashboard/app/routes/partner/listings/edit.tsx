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
import { FormPage } from '~/components/form-page';
import { ListingStatusBadge } from '~/components/status-badge';
import { ListingForm } from '~/features/partner/components/listing-form';
import { PendingChangeBanner } from '~/features/partner/components/pending-change-banner';
import { applyRevisionDiff } from '~/features/partner/lib/listing-revision';
import { dashboardPaths } from '~/constants/paths';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages, notFoundMessages } from '~/constants/messages';

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
    apiGet<ListingResponse>(apiPaths.partner.listing(params.listingId), auth),
    apiGet<ListingTypeResponse[]>(apiPaths.partner.listingTypes, auth),
    apiGet<CancellationPolicyResponse[]>(apiPaths.partner.cancellationPolicies, auth),
    apiGet<ListingRevisionResponse | null>(apiPaths.partner.listingRevision(params.listingId), auth),
  ]);
  if (!listingRes.ok || !listingRes.data) {
    throw new Response(notFoundMessages.listing, {
      status: listingRes.status === 403 ? 403 : 404,
    });
  }
  const requirementRes = await apiGet<DepositRequirementResponse>(
    apiPaths.partner.listingDepositRequirement,
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
      const res = await apiDelete(apiPaths.partner.listingRevision(params.listingId), auth);
      if (!res.ok) {
        return data(
          { error: res.error ?? 'Huỷ thay đổi không thành công.', fieldErrors: null },
          {
            status: 400,
          },
        );
      }
      return redirect(dashboardPaths.partner.listingEdit(params.listingId));
    }
    return data({ error: actionMessages.invalidRequest, fieldErrors: null }, { status: 400 });
  }
  const parsed = updateListingInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await apiPatch(apiPaths.partner.listing(params.listingId), parsed.data, auth);
  if (!res.ok) {
    return data(
      { error: res.error ?? actionMessages.saveFailed, fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  }
  return redirect(`${dashboardPaths.partner.listing(params.listingId)}?updated=1`);
}

export default function EditListingPage({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <FormPage
      backTo={dashboardPaths.partner.listing(loaderData.listing.id)}
      backLabel="Tin đăng"
      title="Sửa tin đăng"
      description={loaderData.listing.title}
      banner={
        <>
          <ListingStatusStrip listing={loaderData.listing} />
          <PendingChangeBanner revision={loaderData.revision} />
        </>
      }
    >
      <ListingForm
        listingTypes={loaderData.listingTypes}
        partnerId={loaderData.partnerId}
        listing={loaderData.formListing}
        cancellationPolicies={loaderData.cancellationPolicies}
        minimumDepositPercent={loaderData.minimumDepositPercent}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
        mode="edit-workspace"
      />
    </FormPage>
  );
}
