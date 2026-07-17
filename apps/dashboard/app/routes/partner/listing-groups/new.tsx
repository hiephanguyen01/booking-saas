import { data, redirect } from 'react-router';
import { createListingGroupInputSchema, type ListingTypeResponse } from '@booking/contracts';
import type { Route } from './+types/new';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { ListingGroupForm } from '~/features/partner/components/listing-group-form';

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.listings.write');
  const typeId = new URL(request.url).searchParams.get('type');
  const types = await apiGet<ListingTypeResponse[]>('/partner/listing-types', auth);
  const listingType = (types.data ?? []).find(
    (type) => type.id === typeId && type.structure !== 'standalone',
  );
  if (!listingType) throw new Response('Loại dịch vụ không hỗ trợ bài đăng nhóm.', { status: 404 });
  return { listingType, partnerId: membership.partnerId };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership, can } = await requirePartner(request);
  if (!can('partner.listings.write'))
    return data({ error: 'Không có quyền tạo bài đăng.', fieldErrors: null }, { status: 403 });
  const parsed = createListingGroupInputSchema.safeParse(await request.json());
  if (!parsed.success)
    return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const res = await apiPost<{ id: string }>(
    '/partner/listing-groups',
    { ...parsed.data, partnerId: membership.partnerId },
    auth,
  );
  if (!res.ok || !res.data)
    return data(
      { error: res.error ?? 'Tạo bài đăng không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  return redirect(`/partner/listing-groups/${res.data.id}`);
}

export default function NewListingGroupPage({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink to="/partner/listings" label="Bài đăng" className="mb-2" />
        <PageHeader
          title="Thông tin chung"
          description={`Tạo bài đăng ${loaderData.listingType.name} chứa nhiều ${loaderData.listingType.itemLabel || 'hạng mục'}.`}
        />
      </div>
      <ListingGroupForm
        partnerId={loaderData.partnerId}
        listingType={loaderData.listingType}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
