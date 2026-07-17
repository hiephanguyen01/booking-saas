import { data, Link, redirect } from 'react-router';
import { ArrowLeft, Lock, TriangleAlert } from 'lucide-react';
import { createListingGroupInputSchema, type ListingGroupDetailResponse, type ListingTypeResponse } from '@booking/contracts';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/edit';
import { apiGet, apiPatch } from '~/lib/api.server';
import { canPartner, requirePartner } from '../partner.server';
import { ListingGroupForm } from '../components/listing-group-form';
import { PageHeader } from '~/components/page-header';
import { ListingStatusBadge } from '~/components/status-badge';

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
  const { group } = loaderData;
  const adminLocked = group.status === 'archived' && group.hiddenBy === 'admin';
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to={`/partner/listing-groups/${group.id}`}>
            <ArrowLeft data-icon="inline-start" /> Bài đăng
          </Link>
        </Button>
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
      {group.status === 'archived' ? (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Bài đăng đang được ẩn</AlertTitle>
          <AlertDescription>
            Lưu thay đổi sẽ chuyển bài đăng và toàn bộ hạng mục về bản nháp; bạn sẽ cần gửi duyệt lại
            để hiển thị.
          </AlertDescription>
        </Alert>
      ) : null}
      <ListingGroupForm
        partnerId={loaderData.partnerId}
        listingType={loaderData.listingType}
        group={group}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
