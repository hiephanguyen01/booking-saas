import { data, Link, useFetcher } from 'react-router';
import { CalendarClock, Copy, Layers3, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import type { ListingGroupDetailResponse, ListingResponse, ListingTypeResponse } from '@booking/contracts';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@booking/ui/components/ui/alert-dialog';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@booking/ui/components/ui/empty';
import { Progress } from '@booking/ui/components/ui/progress';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/listing-groups.$groupId';
import { apiDelete, apiGet, apiPost } from '~/lib/api.server';
import { canPartner, requirePartner } from './partner.server';
import { PageHeader } from './components/page-header';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  const [groupRes, typesRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/partner/listing-groups/${params.groupId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
  ]);
  if (!groupRes.ok || !groupRes.data) throw new Response('Không tìm thấy bài đăng.', { status: groupRes.status });
  return {
    group: groupRes.data,
    listingType: (typesRes.data ?? []).find((type) => type.id === groupRes.data?.listingTypeId) ?? null,
    canWrite: canPartner(membership, 'partner.listings.write'),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.listings.write')) return data({ ok: false, error: 'Không có quyền thay đổi bài đăng.' }, { status: 403 });
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  if (intent === 'submit') {
    const res = await apiPost(`/partner/listing-groups/${params.groupId}/submit`, {}, auth);
    return res.ok ? data({ ok: true, error: null }) : data({ ok: false, error: res.error ?? 'Gửi duyệt không thành công.' }, { status: 400 });
  }
  if (intent === 'delete-child') {
    const listingId = String(form.get('listingId') ?? '');
    const res = await apiDelete(`/partner/listings/${listingId}`, auth);
    return res.ok ? data({ ok: true, error: null }) : data({ ok: false, error: res.error ?? 'Xóa hạng mục không thành công.' }, { status: 400 });
  }
  if (intent === 'duplicate-child') {
    const listingId = String(form.get('listingId') ?? '');
    const source = await apiGet<ListingResponse>(`/partner/listings/${listingId}`, auth);
    if (!source.ok || !source.data || source.data.groupId !== params.groupId) return data({ ok: false, error: 'Không tìm thấy hạng mục cần nhân bản.' }, { status: 404 });
    const stamp = Date.now().toString(36);
    const listing = source.data;
    const res = await apiPost('/partner/listings', {
      partnerId: listing.partnerId,
      listingTypeId: listing.listingTypeId,
      groupId: listing.groupId ?? undefined,
      categoryId: listing.categoryId ?? undefined,
      title: `${listing.title} (bản sao)`,
      slug: `${listing.slug}-copy-${stamp}`,
      description: listing.description ?? undefined,
      photos: listing.photos,
      attributes: listing.attributes,
      bookingModes: listing.bookingModes,
      modeConfig: listing.modeConfig,
      stockQuantity: listing.stockQuantity ?? undefined,
      capacity: listing.capacity ?? undefined,
      bufferBefore: listing.bufferBefore,
      bufferAfter: listing.bufferAfter,
      approvalRequired: listing.approvalRequired,
      depositPercent: listing.depositPercent,
      balanceDue: listing.balanceDue,
      cancellationPolicyId: listing.cancellationPolicyId ?? undefined,
    }, auth);
    return res.ok ? data({ ok: true, error: null }) : data({ ok: false, error: res.error ?? 'Nhân bản hạng mục không thành công.' }, { status: 400 });
  }
  return data({ ok: false, error: 'Hành động không hợp lệ.' }, { status: 400 });
}

function priceFrom(listing: ListingResponse): string {
  const prices = Object.values(listing.modeConfig).flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const config = value as Record<string, unknown>;
    return ['basePrice', 'basePricePerNight'].map((key) => Number(config[key])).filter((value) => Number.isFinite(value) && value > 0);
  });
  return prices.length ? `${new Intl.NumberFormat('vi-VN').format(Math.min(...prices))} ₫` : 'Chưa có giá';
}

export default function ListingGroupWorkspace({ loaderData, actionData }: Route.ComponentProps) {
  const { group, canWrite } = loaderData;
  const itemLabel = group.itemLabel;
  const progress = group.listingCount === 0 ? 33 : group.readyListingCount === group.listingCount ? 100 : 66;
  const columns: DataTableColumn<ListingResponse>[] = [
    { header: itemLabel, cell: (listing) => <div className="flex min-w-0 items-center gap-3">{listing.photos[0] ? <img src={listing.photos[0]} alt="" className="size-12 rounded-md object-cover" /> : <div className="size-12 rounded-md bg-muted" />}<div className="min-w-0"><p className="truncate font-medium">{listing.title}</p><p className="truncate text-xs text-muted-foreground">/{listing.slug}</p></div></div> },
    { header: 'Hình thức', cell: (listing) => <div className="flex flex-wrap gap-1">{listing.bookingModes.map((mode) => <Badge key={mode} variant="outline">{mode}</Badge>)}</div> },
    { header: 'Giá từ', cell: priceFrom },
    { header: 'Hoàn thiện', cell: (listing) => <Badge variant={listing.description && listing.photos.length ? 'secondary' : 'outline'}>{listing.description && listing.photos.length ? 'Sẵn sàng' : 'Cần bổ sung'}</Badge> },
    { header: '', className: 'text-right', headClassName: 'text-right', cell: (listing) => <GroupedListingActions groupId={group.id} listing={listing} itemLabel={itemLabel} disabled={!canWrite || group.status !== 'draft'} /> },
  ];

  return <div className="flex flex-col gap-6">
    <PageHeader title={group.title} description={`${loaderData.listingType?.name ?? 'Bài đăng'} · ${group.listingCount} ${itemLabel}`} actions={<><Badge variant="outline">{group.status}</Badge>{canWrite && ['draft', 'archived'].includes(group.status) ? <Button asChild variant="outline" size="sm"><Link to={`/partner/listing-groups/${group.id}/edit`}><Pencil data-icon="inline-start" /> Sửa thông tin chung</Link></Button> : null}</>} />
    {actionData?.error ? <Alert variant="destructive"><AlertDescription>{actionData.error}</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle>Tiến độ bài đăng</CardTitle><CardDescription>Thông tin chung → {itemLabel} & giá → Kiểm tra</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><Progress value={progress} /><div className="grid grid-cols-3 text-xs text-muted-foreground"><span>Thông tin chung</span><span className="text-center">{itemLabel} & giá</span><span className="text-right">Kiểm tra</span></div></CardContent></Card>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle className="capitalize">{itemLabel} & giá</CardTitle><CardDescription>Những lựa chọn khách hàng có thể đặt trong bài đăng này.</CardDescription></div>{canWrite && group.status === 'draft' ? <Button asChild size="sm"><Link to={`/partner/listing-groups/${group.id}/listings/new`}><Plus data-icon="inline-start" /> Thêm {itemLabel}</Link></Button> : null}</CardHeader><CardContent>{group.listings.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Layers3 /></EmptyMedia><EmptyTitle>Chưa có {itemLabel} nào</EmptyTitle><EmptyDescription>Thêm ít nhất một {itemLabel} mà khách hàng có thể chọn và đặt.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild><Link to={`/partner/listing-groups/${group.id}/listings/new`}><Plus data-icon="inline-start" /> Thêm {itemLabel}</Link></Button></EmptyContent></Empty> : <><div className="hidden md:block"><DataTable columns={columns} data={group.listings} getRowKey={(listing) => listing.id} /></div><div className="grid gap-3 md:hidden">{group.listings.map((listing) => <GroupedListingCard key={listing.id} groupId={group.id} listing={listing} itemLabel={itemLabel} disabled={!canWrite || group.status !== 'draft'} />)}</div></>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Kiểm tra</CardTitle><CardDescription>{group.readyListingCount}/{group.listingCount} {itemLabel} sẵn sàng.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><ul className="flex flex-col gap-2 text-sm"><li>Thông tin chung: {group.description && group.photos.length ? 'Đã đủ' : 'Cần bổ sung'}</li><li>Ít nhất một {itemLabel}: {group.listingCount ? 'Đã có' : 'Chưa có'}</li><li>Nội dung {itemLabel}: {group.readyListingCount === group.listingCount && group.listingCount ? 'Đã đủ' : 'Cần bổ sung'}</li></ul>{canWrite && group.status === 'draft' ? <SubmitGroupButton disabled={!group.listingCount} /> : null}</CardContent></Card>
    </div>
  </div>;
}

function SubmitGroupButton({ disabled }: { disabled: boolean }) { const fetcher = useFetcher(); return <Button disabled={disabled || fetcher.state !== 'idle'} onClick={() => fetcher.submit({ intent: 'submit' }, { method: 'post' })}><Send data-icon="inline-start" /> Gửi duyệt</Button>; }

function GroupedListingCard({ groupId, listing, itemLabel, disabled }: { groupId: string; listing: ListingResponse; itemLabel: string; disabled: boolean }) {
  return <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3"><div className="flex min-w-0 gap-3">{listing.photos[0] ? <img src={listing.photos[0]} alt="" className="size-16 shrink-0 rounded-md object-cover" /> : <div className="size-16 shrink-0 rounded-md bg-muted" />}<div className="min-w-0 flex-1"><p className="truncate font-medium">{listing.title}</p><p className="truncate text-xs text-muted-foreground">/{listing.slug}</p><div className="mt-2 flex flex-wrap gap-1">{listing.bookingModes.map((mode) => <Badge key={mode} variant="outline">{mode}</Badge>)}</div></div></div><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-muted-foreground">Giá từ</p><p className="text-sm font-medium">{priceFrom(listing)}</p></div><Badge variant={listing.description && listing.photos.length ? 'secondary' : 'outline'}>{listing.description && listing.photos.length ? 'Sẵn sàng' : 'Cần bổ sung'}</Badge></div><GroupedListingActions groupId={groupId} listing={listing} itemLabel={itemLabel} disabled={disabled} /></div>;
}

function GroupedListingActions({ groupId, listing, itemLabel, disabled }: { groupId: string; listing: ListingResponse; itemLabel: string; disabled: boolean }) {
  const fetcher = useFetcher();
  return <div className="flex justify-end gap-1">{disabled ? <Button size="icon-sm" variant="ghost" disabled title="Giờ hoạt động"><CalendarClock /></Button> : <Button asChild size="icon-sm" variant="ghost"><Link to={`/partner/listings/${listing.id}/hours`} title="Giờ hoạt động"><CalendarClock /></Link></Button>}{disabled ? <Button size="icon-sm" variant="ghost" disabled title={`Sửa ${itemLabel}`}><Pencil /></Button> : <Button asChild size="icon-sm" variant="ghost"><Link to={`/partner/listing-groups/${groupId}/listings/${listing.id}/edit`} title={`Sửa ${itemLabel}`}><Pencil /></Link></Button>}<Button size="icon-sm" variant="ghost" disabled={disabled || fetcher.state !== 'idle'} title={`Nhân bản ${itemLabel}`} onClick={() => fetcher.submit({ intent: 'duplicate-child', listingId: listing.id }, { method: 'post' })}><Copy /></Button><AlertDialog><AlertDialogTrigger asChild><Button size="icon-sm" variant="ghost" disabled={disabled} title={`Xóa ${itemLabel}`}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xóa {itemLabel}?</AlertDialogTitle><AlertDialogDescription>Thao tác này không thể hoàn tác.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Hủy</AlertDialogCancel><AlertDialogAction disabled={fetcher.state !== 'idle'} onClick={() => fetcher.submit({ intent: 'delete-child', listingId: listing.id }, { method: 'post' })}>Xóa</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}
