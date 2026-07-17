import { data, Link, redirect } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import {
  createListingInputSchema,
  type CancellationPolicySummary,
  type ListingGroupDetailResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/listings.new';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { ListingForm } from '~/features/partner/components/listing-form';
import { PageHeader } from '~/components/page-header';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const [groupRes, typesRes, policiesRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/partner/listing-groups/${params.groupId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
    apiGet<CancellationPolicySummary[]>('/partner/cancellation-policies', auth),
  ]);
  if (!groupRes.ok || !groupRes.data)
    throw new Response('Không tìm thấy bài đăng.', { status: groupRes.status });
  if (groupRes.data.status !== 'draft')
    throw new Response('Chỉ có thể thêm hạng mục vào bài đăng nháp.', { status: 409 });
  const listingType = (typesRes.data ?? []).find(
    (type) => type.id === groupRes.data?.listingTypeId,
  );
  if (!listingType) throw new Response('Không tìm thấy loại dịch vụ.', { status: 404 });
  return {
    group: groupRes.data,
    listingType,
    cancellationPolicies: policiesRes.data ?? [],
    partnerId: membership.partnerId,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  const parsed = createListingInputSchema.safeParse(await request.json());
  if (!parsed.success)
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const res = await apiPost(
    '/partner/listings',
    { ...parsed.data, partnerId: membership.partnerId, groupId: params.groupId },
    auth,
  );
  if (!res.ok)
    return data(
      { error: res.error ?? 'Tạo hạng mục không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  return redirect(`/partner/listing-groups/${params.groupId}`);
}

export default function NewGroupedListingPage({ loaderData, actionData }: Route.ComponentProps) {
  const label = loaderData.group.itemLabel;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to={`/partner/listing-groups/${loaderData.group.id}`}>
            <ArrowLeft data-icon="inline-start" /> {loaderData.group.title}
          </Link>
        </Button>
        <PageHeader
          title={`Thêm ${label}`}
          description={`Tạo một ${label} mà khách hàng có thể chọn và đặt.`}
        />
      </div>
      <ListingForm
        listingTypes={[loaderData.listingType]}
        partnerId={loaderData.partnerId}
        groupId={loaderData.group.id}
        lockedListingTypeId={loaderData.listingType.id}
        cancellationPolicies={loaderData.cancellationPolicies}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
