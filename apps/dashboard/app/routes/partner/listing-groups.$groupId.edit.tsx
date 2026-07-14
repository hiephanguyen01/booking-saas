import { data, Link, redirect } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { createListingGroupInputSchema, type ListingGroupDetailResponse, type ListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/listing-groups.$groupId.edit';
import { apiGet, apiPatch } from '~/lib/api.server';
import { canPartner, requirePartner } from './partner.server';
import { ListingGroupForm } from './components/listing-group-form';
import { PageHeader } from './components/page-header';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.listings.write')) throw new Response('Không có quyền sửa bài đăng.', { status: 403 });
  const [groupRes, typesRes] = await Promise.all([apiGet<ListingGroupDetailResponse>(`/partner/listing-groups/${params.groupId}`, auth), apiGet<ListingTypeResponse[]>('/partner/listing-types', auth)]);
  if (!groupRes.ok || !groupRes.data) throw new Response('Không tìm thấy bài đăng.', { status: groupRes.status });
  if (!['draft', 'archived'].includes(groupRes.data.status)) throw new Response('Hãy ẩn bài đăng trước khi chỉnh sửa.', { status: 409 });
  const listingType = (typesRes.data ?? []).find((type) => type.id === groupRes.data?.listingTypeId);
  if (!listingType) throw new Response('Không tìm thấy loại dịch vụ.', { status: 404 });
  return { group: groupRes.data, listingType, partnerId: membership.partnerId };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  const parsed = createListingGroupInputSchema.safeParse(await request.json());
  if (!parsed.success) return data({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const res = await apiPatch(`/partner/listing-groups/${params.groupId}`, { ...parsed.data, partnerId: membership.partnerId }, auth);
  if (!res.ok) return data({ error: res.error ?? 'Lưu không thành công.', fieldErrors: res.errors ?? null }, { status: 400 });
  return redirect(`/partner/listing-groups/${params.groupId}`);
}

export default function EditListingGroupPage({ loaderData, actionData }: Route.ComponentProps) {
  return <div className="flex flex-col gap-5"><div><Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link to={`/partner/listing-groups/${loaderData.group.id}`}><ArrowLeft data-icon="inline-start" /> Bài đăng</Link></Button><PageHeader title="Sửa thông tin chung" description={loaderData.group.title} /></div><ListingGroupForm partnerId={loaderData.partnerId} listingType={loaderData.listingType} group={loaderData.group} serverError={actionData?.error ?? null} fieldErrors={actionData?.fieldErrors ?? null} /></div>;
}
