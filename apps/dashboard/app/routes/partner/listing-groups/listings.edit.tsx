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
import { FormPage } from '~/components/form-page';
import { requirePartner } from '~/features/partner/server/partner.server';
import { dashboardPaths } from '~/constants/paths';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages, notFoundMessages } from '~/constants/messages';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const [groupRes, listingRes, typesRes, policiesRes, revisionRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(apiPaths.partner.listingGroup(params.groupId), auth),
    apiGet<ListingResponse>(apiPaths.partner.listing(params.listingId), auth),
    apiGet<ListingTypeResponse[]>(apiPaths.partner.listingTypes, auth),
    apiGet<CancellationPolicyResponse[]>(apiPaths.partner.cancellationPolicies, auth),
    apiGet<ListingRevisionResponse | null>(apiPaths.partner.listingRevision(params.listingId), auth),
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
  if (!listingType) throw new Response(notFoundMessages.listingType, { status: 404 });
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
      const res = await apiDelete(apiPaths.partner.listingRevision(params.listingId), auth);
      if (!res.ok) {
        return data(
          { error: res.error ?? 'Huỷ thay đổi không thành công.', fieldErrors: null },
          { status: 400 },
        );
      }
      return redirect(
        dashboardPaths.partner.listingGroupItemEdit(params.groupId, params.listingId),
      );
    }
    return data({ error: actionMessages.invalidRequest, fieldErrors: null }, { status: 400 });
  }
  const parsed = updateListingInputSchema.safeParse(await request.json());
  if (!parsed.success)
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const res = await apiPatch(apiPaths.partner.listing(params.listingId), parsed.data, auth);
  if (!res.ok)
    return data(
      { error: res.error ?? actionMessages.saveFailed, fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  return redirect(`${dashboardPaths.partner.listingGroup(params.groupId)}?updated=1`);
}

export default function EditGroupedListingPage({ loaderData, actionData }: Route.ComponentProps) {
  const label = loaderData.group.itemLabel;
  return (
    <FormPage
      backTo={dashboardPaths.partner.listingGroup(loaderData.group.id)}
      backLabel={loaderData.group.title}
      title={`Sửa ${label}`}
      description={loaderData.listing.title}
      banner={<PendingChangeBanner revision={loaderData.revision} targetLabel={label} />}
    >
      <ListingForm
        listingTypes={[loaderData.listingType]}
        partnerId={loaderData.partnerId}
        listing={loaderData.formListing}
        groupId={loaderData.group.id}
        lockedListingTypeId={loaderData.listingType.id}
        cancellationPolicies={loaderData.cancellationPolicies}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
        mode="edit-workspace"
      />
    </FormPage>
  );
}
