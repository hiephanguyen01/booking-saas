import { data, redirect } from 'react-router';
import {
  createListingInputSchema,
  type CancellationPolicyResponse,
  type ListingGroupDetailResponse,
  type ListingResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import type { Route } from './+types/listings.new';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { ListingForm } from '~/features/partner/components/listing-form';
import { FormPage } from '~/components/form-page';
import { dashboardPaths } from '~/constants/paths';
import { SuccessBanner } from '~/components/action-feedback';
import { apiPaths } from '~/constants/api-paths';
import { notFoundMessages } from '~/constants/messages';

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: `Thêm ${loaderData?.group?.itemLabel ?? 'hạng mục'} · Đối tác · BookingOS` }];
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const [groupRes, typesRes, policiesRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(apiPaths.partner.listingGroup(params.groupId), auth),
    apiGet<ListingTypeResponse[]>(apiPaths.partner.listingTypes, auth),
    apiGet<CancellationPolicyResponse[]>(apiPaths.partner.cancellationPolicies, auth),
  ]);
  if (!groupRes.ok || !groupRes.data)
    throw new Response(notFoundMessages.listing, { status: groupRes.status });
  if (groupRes.data.status !== 'draft')
    throw new Response('Chỉ có thể thêm hạng mục vào tin đăng nháp.', { status: 409 });
  const listingType = (typesRes.data ?? []).find(
    (type) => type.id === groupRes.data?.listingTypeId,
  );
  if (!listingType) throw new Response(notFoundMessages.listingType, { status: 404 });
  return {
    group: groupRes.data,
    listingType,
    cancellationPolicies: policiesRes.data ?? [],
    partnerId: membership.partnerId,
    created: url.searchParams.get('created') === '1',
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  const body = (await request.json()) as Record<string, unknown>;
  const next = body.next === 'add-another' ? 'add-another' : 'group';
  const parsed = createListingInputSchema.safeParse(body);
  if (!parsed.success)
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const res = await apiPost<ListingResponse>(
    apiPaths.partner.listings,
    { ...parsed.data, partnerId: membership.partnerId, groupId: params.groupId },
    auth,
  );
  if (!res.ok)
    return data(
      { error: res.error ?? 'Tạo hạng mục không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  return redirect(
    next === 'add-another'
      ? `${dashboardPaths.partner.listingGroupItemNew(params.groupId)}?created=1`
      : `${dashboardPaths.partner.listingGroup(params.groupId)}?created=1`,
  );
}

export default function NewGroupedListingPage({ loaderData, actionData }: Route.ComponentProps) {
  const label = loaderData.group.itemLabel;
  return (
    <FormPage
      backTo={dashboardPaths.partner.listingGroup(loaderData.group.id)}
      backLabel={loaderData.group.title}
      title={`Thêm ${label}`}
      description={`Tạo một ${label} mà khách hàng có thể chọn và đặt.`}
      banner={
        <SuccessBanner
          message={loaderData.created ? `Đã lưu ${label}. Tiếp tục thêm ${label} khác.` : null}
        />
      }
    >
      <ListingForm
        listingTypes={[loaderData.listingType]}
        partnerId={loaderData.partnerId}
        groupId={loaderData.group.id}
        lockedListingTypeId={loaderData.listingType.id}
        cancellationPolicies={loaderData.cancellationPolicies}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
        inheritedAddress={{
          provinceCode: loaderData.group.provinceCode ?? '',
          wardCode: loaderData.group.wardCode ?? '',
          address: loaderData.group.address ?? '',
        }}
      />
    </FormPage>
  );
}
