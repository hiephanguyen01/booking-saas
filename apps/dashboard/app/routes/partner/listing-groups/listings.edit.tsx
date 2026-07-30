import {
  updateListingInputSchema,
  type CancellationPolicyResponse,
  type ListingGroupDetailResponse,
  type ListingResponse,
  type ListingRevisionResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { data, redirect } from 'react-router';
import { apiDelete, apiGet, apiPatch } from '~/lib/api.server';
import type { Route } from './+types/listings.edit';
import { ListingForm } from '~/features/partner/components/listing-form';
import { PendingChangeBanner } from '~/features/partner/components/pending-change-banner';
import { applyRevisionDiff } from '~/features/partner/lib/listing-revision';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { requirePartner } from '~/features/partner/server/partner.server';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const [groupRes, listingRes, typesRes, policiesRes, revisionRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/partner/listing-groups/${params.groupId}`, auth),
    apiGet<ListingResponse>(`/partner/listings/${params.listingId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
    apiGet<CancellationPolicyResponse[]>('/partner/cancellation-policies', auth),
    apiGet<ListingRevisionResponse | null>(
      `/partner/listings/${params.listingId}/revision`,
      auth,
    ),
  ]);
  if (
    !groupRes.ok ||
    !groupRes.data ||
    !listingRes.ok ||
    !listingRes.data ||
    listingRes.data.groupId !== groupRes.data.id
  )
    throw new Response('Không tìm thấy hạng mục.', { status: 404 });
  const listingType = (typesRes.data ?? []).find(
    (type) => type.id === groupRes.data?.listingTypeId,
  );
  if (!listingType) throw new Response('Không tìm thấy loại dịch vụ.', { status: 404 });
  const revision = revisionRes.ok ? (revisionRes.data ?? null) : null;
  return {
    group: groupRes.data,
    listing: listingRes.data,
    formListing: applyRevisionDiff(listingRes.data, revision),
    revision,
    listingType,
    cancellationPolicies: policiesRes.data ?? [],
    partnerId: membership.partnerId,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requirePartner(request);
  if (!request.headers.get('content-type')?.includes('application/json')) {
    const form = await request.formData();
    if (form.get('intent') === 'discard-revision') {
      const res = await apiDelete(`/partner/listings/${params.listingId}/revision`, auth);
      if (!res.ok) {
        return data(
          { error: res.error ?? 'Huỷ thay đổi không thành công.', fieldErrors: null },
          { status: 400 },
        );
      }
      return redirect(
        `/partner/listing-groups/${params.groupId}/listings/${params.listingId}/edit`,
      );
    }
    return data({ error: 'Yêu cầu không hợp lệ.', fieldErrors: null }, { status: 400 });
  }
  const parsed = updateListingInputSchema.safeParse(await request.json());
  if (!parsed.success)
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const res = await apiPatch(`/partner/listings/${params.listingId}`, parsed.data, auth);
  if (!res.ok)
    return data(
      { error: res.error ?? 'Lưu không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  return redirect(`/partner/listing-groups/${params.groupId}`);
}

export default function EditGroupedListingPage({ loaderData, actionData }: Route.ComponentProps) {
  const label = loaderData.group.itemLabel;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink
          to={`/partner/listing-groups/${loaderData.group.id}`}
          label={loaderData.group.title}
          className="mb-2"
        />
        <PageHeader title={`Sửa ${label}`} description={loaderData.listing.title} />
      </div>
      <PendingChangeBanner revision={loaderData.revision} targetLabel={label} />
      <ListingForm
        listingTypes={[loaderData.listingType]}
        partnerId={loaderData.partnerId}
        listing={loaderData.formListing}
        groupId={loaderData.group.id}
        lockedListingTypeId={loaderData.listingType.id}
        cancellationPolicies={loaderData.cancellationPolicies}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
