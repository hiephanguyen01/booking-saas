import { data, redirect } from 'react-router';
import { Lock } from 'lucide-react';
import {
  createListingGroupInputSchema,
  type ListingGroupDetailResponse,
  type ListingGroupPendingChangesResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import type { Route } from './+types/edit';
import { apiDelete, apiGet, apiPatch } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { ListingGroupForm } from '~/features/partner/components/listing-group-form';
import { PendingChangeBanner } from '~/features/partner/components/pending-change-banner';
import { applyRevisionDiff } from '~/features/partner/lib/listing-revision';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { ListingStatusBadge } from '~/components/status-badge';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const [groupRes, typesRes, pendingRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/partner/listing-groups/${params.groupId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
    apiGet<ListingGroupPendingChangesResponse>(
      `/partner/listing-groups/${params.groupId}/pending-changes`,
      auth,
    ),
  ]);
  if (!groupRes.ok || !groupRes.data)
    throw new Response('Không tìm thấy tin đăng.', { status: groupRes.status });
  const listingType = (typesRes.data ?? []).find(
    (type) => type.id === groupRes.data?.listingTypeId,
  );
  if (!listingType) throw new Response('Không tìm thấy loại dịch vụ.', { status: 404 });
  const revision = pendingRes.ok ? (pendingRes.data?.group ?? null) : null;
  return {
    group: groupRes.data,
    // The form opens on the partner's waiting edit, not the approved version.
    formGroup: applyRevisionDiff(groupRes.data, revision),
    revision,
    listingType,
    partnerId: membership.partnerId,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  // The edit form posts JSON; the "huỷ thay đổi" button posts a form field.
  if (!request.headers.get('content-type')?.includes('application/json')) {
    const form = await request.formData();
    if (form.get('intent') === 'discard-revision') {
      const res = await apiDelete(`/partner/listing-groups/${params.groupId}/revision`, auth);
      if (!res.ok) {
        return data(
          { error: res.error ?? 'Huỷ thay đổi không thành công.', fieldErrors: null },
          { status: 400 },
        );
      }
      return redirect(`/partner/listing-groups/${params.groupId}/edit`);
    }
    return data({ error: 'Yêu cầu không hợp lệ.', fieldErrors: null }, { status: 400 });
  }
  const parsed = createListingGroupInputSchema.safeParse(await request.json());
  if (!parsed.success)
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const res = await apiPatch(
    `/partner/listing-groups/${params.groupId}`,
    { ...parsed.data, partnerId: membership.partnerId },
    auth,
  );
  if (!res.ok)
    return data(
      { error: res.error ?? 'Lưu không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  return redirect(`/partner/listing-groups/${params.groupId}`);
}

export default function EditListingGroupPage({ loaderData, actionData }: Route.ComponentProps) {
  const { group } = loaderData;
  const adminLocked = group.status === 'archived' && group.hiddenBy === 'admin';
  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink to={`/partner/listing-groups/${group.id}`} label="Tin đăng" className="mb-2" />
        <PageHeader title="Sửa thông tin chung" description={group.title} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <ListingStatusBadge status={group.status} />
        {adminLocked ? (
          <span className="inline-flex items-center gap-1.5 text-warning">
            <Lock className="size-3.5" aria-hidden />
            Bị quản trị viên ẩn.
          </span>
        ) : group.hiddenBy ? (
          <span className="text-muted-foreground">
            Đã ẩn bởi {group.hiddenBy === 'admin' ? 'quản trị viên' : 'đối tác'}.
          </span>
        ) : null}
      </div>
      <PendingChangeBanner revision={loaderData.revision} />
      <ListingGroupForm
        partnerId={loaderData.partnerId}
        listingType={loaderData.listingType}
        group={loaderData.formGroup}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
