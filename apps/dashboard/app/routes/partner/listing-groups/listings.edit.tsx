import {
  updateListingInputSchema,
  type CancellationPolicyResponse,
  type ListingGroupDetailResponse,
  type ListingResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { data, redirect } from 'react-router';
import { apiGet, apiPatch } from '~/lib/api.server';
import type { Route } from './+types/listings.edit';
import { ListingForm } from '~/features/partner/components/listing-form';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { requirePartner } from '~/features/partner/server/partner.server';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const [groupRes, listingRes, typesRes, policiesRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/partner/listing-groups/${params.groupId}`, auth),
    apiGet<ListingResponse>(`/partner/listings/${params.listingId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
    apiGet<CancellationPolicyResponse[]>('/partner/cancellation-policies', auth),
  ]);
  if (
    !groupRes.ok ||
    !groupRes.data ||
    !listingRes.ok ||
    !listingRes.data ||
    listingRes.data.groupId !== groupRes.data.id
  )
    throw new Response('Không tìm thấy hạng mục.', { status: 404 });
  if (groupRes.data.status !== 'draft')
    throw new Response('Hãy ẩn tin đăng trước khi sửa hạng mục.', { status: 409 });
  const listingType = (typesRes.data ?? []).find(
    (type) => type.id === groupRes.data?.listingTypeId,
  );
  if (!listingType) throw new Response('Không tìm thấy loại dịch vụ.', { status: 404 });
  return {
    group: groupRes.data,
    listing: listingRes.data,
    listingType,
    cancellationPolicies: policiesRes.data ?? [],
    partnerId: membership.partnerId,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requirePartner(request);
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
      <ListingForm
        listingTypes={[loaderData.listingType]}
        partnerId={loaderData.partnerId}
        listing={loaderData.listing}
        groupId={loaderData.group.id}
        lockedListingTypeId={loaderData.listingType.id}
        cancellationPolicies={loaderData.cancellationPolicies}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
