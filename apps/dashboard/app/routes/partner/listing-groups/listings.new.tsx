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
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { dashboardPaths } from '~/constants/paths';
import { SuccessBanner } from '~/components/action-feedback';

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const [groupRes, typesRes, policiesRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/partner/listing-groups/${params.groupId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
    apiGet<CancellationPolicyResponse[]>('/partner/cancellation-policies', auth),
  ]);
  if (!groupRes.ok || !groupRes.data)
    throw new Response('Không tìm thấy tin đăng.', { status: groupRes.status });
  if (groupRes.data.status !== 'draft')
    throw new Response('Chỉ có thể thêm hạng mục vào tin đăng nháp.', { status: 409 });
  const listingType = (typesRes.data ?? []).find(
    (type) => type.id === groupRes.data?.listingTypeId,
  );
  if (!listingType) throw new Response('Không tìm thấy loại dịch vụ.', { status: 404 });
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
    '/partner/listings',
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
    <div className="flex flex-col gap-5">
      <div>
        <BackLink
          to={dashboardPaths.partner.listingGroup(loaderData.group.id)}
          label={loaderData.group.title}
          className="mb-2"
        />
        <PageHeader
          title={`Thêm ${label}`}
          description={`Tạo một ${label} mà khách hàng có thể chọn và đặt.`}
        />
      </div>
      <SuccessBanner
        message={loaderData.created ? `Đã lưu ${label}. Tiếp tục thêm ${label} khác.` : null}
      />
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
    </div>
  );
}
