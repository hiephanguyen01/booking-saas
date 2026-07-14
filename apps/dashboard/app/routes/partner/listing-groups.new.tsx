import { data, Link, redirect } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { createListingGroupInputSchema, type ListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/listing-groups.new';
import { apiGet, apiPost } from '~/lib/api.server';
import { canPartner, requirePartner } from './partner.server';
import { PageHeader } from './components/page-header';
import { ListingGroupForm } from './components/listing-group-form';

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.listings.write')) throw new Response('Không có quyền tạo bài đăng.', { status: 403 });
  const typeId = new URL(request.url).searchParams.get('type');
  const types = await apiGet<ListingTypeResponse[]>('/partner/listing-types', auth);
  const listingType = (types.data ?? []).find((type) => type.id === typeId && type.structure !== 'standalone');
  if (!listingType) throw new Response('Loại dịch vụ không hỗ trợ bài đăng nhóm.', { status: 404 });
  return { listingType, partnerId: membership.partnerId };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.listings.write')) return data({ error: 'Không có quyền tạo bài đăng.', fieldErrors: null }, { status: 403 });
  const parsed = createListingGroupInputSchema.safeParse(await request.json());
  if (!parsed.success) return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const res = await apiPost<{ id: string }>('/partner/listing-groups', { ...parsed.data, partnerId: membership.partnerId }, auth);
  if (!res.ok || !res.data) return data({ error: res.error ?? 'Tạo bài đăng không thành công.', fieldErrors: res.errors ?? null }, { status: 400 });
  return redirect(`/partner/listing-groups/${res.data.id}`);
}

export default function NewListingGroupPage({ loaderData, actionData }: Route.ComponentProps) {
  return <div className="flex flex-col gap-5">
    <div><Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link to="/partner/listings"><ArrowLeft data-icon="inline-start" /> Bài đăng</Link></Button>
      <PageHeader title="Thông tin chung" description={`Tạo bài đăng ${loaderData.listingType.name} chứa nhiều ${loaderData.listingType.itemLabel || 'hạng mục'}.`} />
    </div>
    <ListingGroupForm partnerId={loaderData.partnerId} listingType={loaderData.listingType} serverError={actionData?.error ?? null} fieldErrors={actionData?.fieldErrors ?? null} />
  </div>;
}
