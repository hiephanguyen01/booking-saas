import { useState } from 'react';
import { Form, Link, redirect, useNavigation } from 'react-router';
import type { BalanceDue, BookingMode, ListingResponse, ListingReviewResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Badge } from '@booking/ui/components/ui/badge';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { FORM_TEXTAREA } from '@booking/ui/components/form/control';
import { Separator } from '@booking/ui/components/ui/separator';
import { ArrowLeft, Check, CircleAlert, EyeOff, ImageOff, ShieldCheck, X } from 'lucide-react';
import type { Route } from './+types/review';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { PageHeader } from '../components/page';
import { formatVnd } from '../format';
import { ListingStatusBadge } from '../components/status';

const MODE_LABEL: Record<BookingMode, string> = {
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  inventory: 'Theo kho',
  appointment: 'Lịch hẹn',
  class: 'Lớp học',
};
const BALANCE_LABEL: Record<BalanceDue, string> = {
  online_before: 'Trực tuyến trước',
  on_arrival: 'Tại chỗ',
};

/** Read a mode's base price out of the free-form `modeConfig` JSON. */
function modeBasePrice(mode: BookingMode, modeConfig: Record<string, unknown>): string | null {
  const cfg = modeConfig[mode];
  if (!cfg || typeof cfg !== 'object') return null;
  const c = cfg as Record<string, unknown>;
  const raw = mode === 'daily' ? c.basePricePerNight : c.basePrice;
  return raw === undefined || raw === null ? null : String(raw);
}

function attributeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  return String(value);
}

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Kiểm duyệt listing · Tenant · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const [listingRes, reviewRes] = await Promise.all([
    apiGet<ListingResponse>(`/tenant/listings/${params.listingId}`, auth),
    apiGet<ListingReviewResponse>(`/tenant/listings/${params.listingId}/review`, auth),
  ]);
  if (!reviewRes.ok || !reviewRes.data) {
    throw new Response(reviewRes.error ?? 'Không tìm thấy listing', { status: reviewRes.status });
  }
  return {
    listing: listingRes.ok ? listingRes.data : null,
    review: reviewRes.data,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const id = params.listingId;

  let res;
  if (intent === 'publish') {
    const force = form.get('bypass') === '1';
    res = await apiPost(`/tenant/listings/${id}/publish`, { force }, auth);
  } else if (intent === 'republish') {
    res = await apiPost(`/tenant/listings/${id}/republish`, {}, auth);
  } else if (intent === 'hide') {
    const reason = String(form.get('reason') ?? '').trim();
    res = await apiPost(`/tenant/listings/${id}/hide`, reason ? { reason } : {}, auth);
  } else {
    return { error: 'Hành động không hợp lệ.' };
  }

  if (!res.ok) return { error: res.error ?? 'Thao tác thất bại.' };
  return redirect('/tenant/listings');
}

export default function ReviewListing({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, review } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== 'idle';
  const hasContactLeak = review.contactFlags.length > 0;
  const canPublish = review.checklistPassed && !hasContactLeak;
  const [bypass, setBypass] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/tenant/listings">
            <ArrowLeft className="size-4" /> Danh sách
          </Link>
        </Button>
      </div>

      <PageHeader
        title={listing?.title ?? 'Kiểm duyệt listing'}
        description={listing ? `/${listing.slug}` : undefined}
        actions={<ListingStatusBadge status={review.status} />}
      />

      {actionData && 'error' in actionData && actionData.error ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Không thực hiện được</AlertTitle>
          <AlertDescription>{actionData.error}</AlertDescription>
        </Alert>
      ) : null}

      {listing ? <ListingDetails listing={listing} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Checklist duyệt</CardTitle>
            <CardDescription>
              {review.checklistPassed
                ? 'Tất cả tiêu chí bắt buộc đã đạt.'
                : 'Còn tiêu chí chưa đạt — không thể xuất bản.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {review.checklist.map((item) => (
                <li key={item.key} className="flex items-center gap-3 py-3">
                  <span
                    className={
                      item.passed
                        ? 'flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'flex size-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                    }
                  >
                    {item.passed ? <Check className="size-4" /> : <X className="size-4" />}
                  </span>
                  <span className="text-sm">{item.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> Quét thông tin liên hệ
            </CardTitle>
            <CardDescription>Chống lách sàn (§7.3)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasContactLeak ? (
              <>
                <Alert variant="destructive">
                  <CircleAlert className="size-4" />
                  <AlertTitle>Phát hiện {review.contactFlags.length} dấu hiệu</AlertTitle>
                  <AlertDescription>Xuất bản bị chặn cho tới khi được gỡ bỏ.</AlertDescription>
                </Alert>
                <ul className="space-y-2">
                  {review.contactFlags.map((flag, i) => (
                    <li key={i} className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs dark:border-rose-500/30 dark:bg-rose-500/10">
                      <span className="font-medium uppercase text-rose-700 dark:text-rose-300">{flag.type}</span>{' '}
                      trong <span className="font-medium">{flag.field}</span>: “{flag.match}”
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Check className="size-4" /> Không phát hiện thông tin liên hệ bị lộ.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hành động kiểm duyệt</CardTitle>
          <CardDescription>Quyết định sẽ được ghi vào nhật ký kiểm duyệt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {review.status !== 'published' ? (
            <div className="space-y-3">
              {!canPublish ? (
                <label className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                  <Checkbox
                    checked={bypass}
                    onCheckedChange={(v) => setBypass(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-amber-800 dark:text-amber-200">
                    <span className="font-medium">Bỏ qua kiểm tra & xuất bản</span> — xuất bản dù checklist
                    chưa đạt{hasContactLeak ? ' hoặc còn lộ thông tin liên hệ' : ''}. Hành động ghi đè này
                    được lưu vào nhật ký kiểm duyệt.
                  </span>
                </label>
              ) : null}
              <Form method="post">
                <input type="hidden" name="intent" value="publish" />
                <input type="hidden" name="bypass" value={bypass ? '1' : ''} />
                <Button type="submit" disabled={busy || (!canPublish && !bypass)}>
                  <Check className="size-4" /> {canPublish ? 'Duyệt & xuất bản' : 'Ghi đè & xuất bản'}
                </Button>
              </Form>
            </div>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="republish" />
              <Button type="submit" variant="outline" disabled={busy}>
                <Check className="size-4" /> Hiển thị lại
              </Button>
            </Form>
          )}

          <Separator />

          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="hide" />
            <div className="space-y-1.5">
              <label htmlFor="reason" className="text-sm font-medium">
                Lý do ẩn / từ chối (tuỳ chọn)
              </label>
              <Textarea
                id="reason"
                name="reason"
                rows={3}
                placeholder="VD: Ảnh không rõ, thiếu mô tả, lộ số điện thoại…"
                className={FORM_TEXTAREA}
              />
            </div>
            <Button type="submit" variant="destructive" disabled={busy}>
              <EyeOff className="size-4" /> Ẩn listing
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

/** Full detail of the listing under review, so the reviewer decides on real content. */
function ListingDetails({ listing }: { listing: ListingResponse }) {
  const attributes = Object.entries(listing.attributes ?? {});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chi tiết listing</CardTitle>
        <CardDescription>Nội dung đối tác gửi lên để kiểm duyệt.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {listing.photos.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {listing.photos.map((src, i) => (
              <img
                key={`${src}-${i}`}
                src={src}
                alt=""
                className="h-28 w-28 rounded-lg border object-cover"
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            <ImageOff className="size-4" /> Chưa có ảnh nào.
          </div>
        )}

        <Detail label="Mô tả">
          {listing.description ? (
            <p className="whitespace-pre-wrap text-sm">{listing.description}</p>
          ) : (
            <span className="text-sm text-muted-foreground">Chưa có mô tả.</span>
          )}
        </Detail>

        <Detail label="Hình thức đặt & giá">
          {listing.bookingModes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {listing.bookingModes.map((mode) => {
                const price = modeBasePrice(mode, listing.modeConfig);
                return (
                  <Badge key={mode} variant="secondary" className="gap-1 font-normal">
                    {MODE_LABEL[mode]}
                    {price ? <span className="font-medium">· {formatVnd(price)}</span> : null}
                  </Badge>
                );
              })}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Chưa bật hình thức đặt nào.</span>
          )}
        </Detail>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Đặt cọc">{listing.depositPercent}%</Stat>
          <Stat label="Thanh toán còn lại">{BALANCE_LABEL[listing.balanceDue]}</Stat>
          <Stat label="Cần duyệt đặt">{listing.approvalRequired ? 'Có' : 'Không'}</Stat>
          <Stat label="Đệm trước / sau">
            {listing.bufferBefore}′ / {listing.bufferAfter}′
          </Stat>
          {listing.stockQuantity !== null ? <Stat label="Tồn kho">{listing.stockQuantity}</Stat> : null}
          {listing.capacity !== null ? <Stat label="Sức chứa">{listing.capacity}</Stat> : null}
          <Stat label="Chính sách huỷ">{listing.cancellationPolicyId ? 'Có' : 'Chưa đặt'}</Stat>
        </div>

        {attributes.length > 0 ? (
          <Detail label="Thuộc tính">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
              {attributes.map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="truncate text-xs text-muted-foreground">{key}</dt>
                  <dd className="truncate">{attributeValue(value)}</dd>
                </div>
              ))}
            </dl>
          </Detail>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}
