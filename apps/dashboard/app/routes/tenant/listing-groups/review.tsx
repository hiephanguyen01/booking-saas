import { useState } from 'react';
import { data as routeData, Link, redirect, useNavigation, useSubmit } from 'react-router';
import type {
  ListingGroupDetailResponse,
  ListingGroupReviewResponse,
  ListingResponse,
} from '@booking/contracts';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Separator } from '@booking/ui/components/ui/separator';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { ConfirmButton } from '~/components/confirm-button';
import { ArrowLeft, Check, CircleAlert, CircleCheck, EyeOff, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import type { Route } from './+types/review';
import { apiGet, apiPost } from '~/lib/api.server';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { listingPriceFrom } from '~/lib/listing-price';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { CONTACT_FIELD_LABEL, CONTACT_FLAG_LABEL } from '~/features/tenant/constants';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { EntityRef } from '~/components/entity-ref';
import { PhotoStrip } from '~/components/photo-strip';
import { ListingStatusBadge, PartnerVerificationBadge } from '~/components/status-badge';

const CHECKLIST_LABEL: Record<string, string> = {
  photos: 'Có ít nhất 1 ảnh',
  description: 'Có mô tả',
  price: 'Mọi hạng mục đều có giá',
  cancellation_policy: 'Mọi hạng mục có chính sách huỷ',
};

/** Contact-scan field names are namespaced for children (`listings[0].description`). */
function contactFieldLabel(field: string): string {
  const match = field.match(/^listings\[(\d+)\]\.(.+)$/);
  if (match) {
    const sub = CONTACT_FIELD_LABEL[match[2]] ?? match[2];
    return `Hạng mục ${Number(match[1]) + 1} · ${sub}`;
  }
  return CONTACT_FIELD_LABEL[field] ?? field;
}

function locationString(group: ListingGroupDetailResponse): string | null {
  const parts = [group.address, group.wardName, group.provinceName].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Kiểm duyệt bài đăng · Tenant · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.listings.read');
  const [detailRes, reviewRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/tenant/listing-groups/${params.groupId}/detail`, auth),
    // The review endpoint requires `tenant.listings.publish`; a read-only user
    // (or a transient failure) gets no checklist rather than a broken page.
    apiGet<ListingGroupReviewResponse>(`/tenant/listing-groups/${params.groupId}/review`, auth),
  ]);
  if (!detailRes.ok || !detailRes.data) {
    throw new Response('Không tìm thấy bài đăng.', { status: detailRes.status });
  }
  return {
    group: detailRes.data,
    review: reviewRes.ok ? (reviewRes.data ?? null) : null,
    reviewFailed: !reviewRes.ok,
    canModerate: can('tenant.listings.publish'),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  if (!['publish', 'hide', 'republish'].includes(intent)) {
    return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  if (intent === 'publish') {
    body = { force: form.get('force') === '1' };
  } else if (intent === 'hide') {
    const reason = String(form.get('reason') ?? '').trim();
    body = reason ? { reason } : {};
  }

  const res = await apiPost(`/tenant/listing-groups/${params.groupId}/${intent}`, body, auth);
  if (!res.ok) {
    const error =
      res.code === 'LISTING_HAS_CONTACT_INFO'
        ? 'Bài đăng còn lộ thông tin liên hệ. Tích “Bỏ qua kiểm tra” để xuất bản bất chấp cảnh báo.'
        : (res.error ?? 'Thao tác không thành công.');
    return routeData({ error }, { status: 400 });
  }
  return redirect('/tenant/listing-groups');
}

export default function ListingGroupReviewPage({ loaderData, actionData }: Route.ComponentProps) {
  const { group, review, reviewFailed, canModerate } = loaderData;
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== 'idle';
  const actionError = actionData && 'error' in actionData ? actionData.error : null;

  const partner = group.listings[0]?.partner ?? null;
  const canPublish = review ? review.checklistPassed && review.contactFlags.length === 0 : false;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/tenant/listing-groups">
          <ArrowLeft className="size-4" /> Bài đăng
        </Link>
      </Button>

      <PageHeader
        title={group.title}
        description={`/${group.slug} · ${group.listingCount} ${group.itemLabel}`}
        actions={<ListingStatusBadge status={group.status} />}
      />

      {actionError ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Chưa thể thực hiện</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Đối tác</CardTitle>
          <CardDescription>Chủ sở hữu bài đăng này.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField
              label="Tên đối tác"
              value={
                <EntityRef
                  to={`/tenant/partners/${group.partnerId}`}
                  name={partner?.name ?? 'Xem đối tác'}
                />
              }
            />
            <DetailField
              label="Xác minh danh tính"
              value={partner ? <PartnerVerificationBadge status={partner.verificationStatus} /> : null}
            />
          </DetailGrid>
        </CardContent>
      </Card>

      <ReviewCard review={review} reviewFailed={reviewFailed} />

      <Card>
        <CardHeader>
          <CardTitle>Nội dung chung</CardTitle>
          <CardDescription>Album và nội dung dùng chung cho toàn bộ bài đăng.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DetailGrid columns={3}>
            <DetailField
              label="Giá từ"
              emphasis="strong"
              value={group.priceFrom ? <Money value={group.priceFrom} /> : null}
            />
            <DetailField label="Số hạng mục" value={`${group.listingCount} ${group.itemLabel}`} />
            <DetailField label="Khu vực hoạt động" value={group.workingArea} />
            <DetailField label="Địa chỉ" span={3} value={locationString(group)} />
          </DetailGrid>

          <DetailSection title="Ảnh" emptyMessage="Chưa có ảnh.">
            {group.photos.length > 0 ? <PhotoStrip photos={group.photos} alt={group.title} /> : null}
          </DetailSection>

          <DetailSection title="Mô tả" emptyMessage="Chưa có mô tả.">
            {group.description ? (
              <p className="whitespace-pre-wrap text-sm">{group.description}</p>
            ) : null}
          </DetailSection>

          <DetailSection title="Tiện ích" emptyMessage="Chưa có tiện ích.">
            {group.amenities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {group.amenities.map((amenity) => (
                  <Badge key={amenity} variant="secondary">
                    {amenity}
                  </Badge>
                ))}
              </div>
            ) : null}
          </DetailSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="capitalize">{group.itemLabel}</CardTitle>
          <CardDescription>
            {group.readyListingCount}/{group.listingCount} hạng mục đạt mức hoàn thiện cơ bản.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {group.listings.length > 0 ? (
            group.listings.map((listing) => <ChildCard key={listing.id} listing={listing} />)
          ) : (
            <p className="text-sm text-muted-foreground">Bài đăng chưa có hạng mục nào.</p>
          )}
        </CardContent>
      </Card>

      {canModerate ? (
        <ActionsCard
          status={group.status}
          hiddenBy={group.hiddenBy}
          canPublish={canPublish}
          reviewFailed={reviewFailed}
          hasContactLeak={(review?.contactFlags.length ?? 0) > 0}
          busy={busy}
          onSubmit={(payload) => submit(payload, { method: 'post' })}
        />
      ) : null}
    </div>
  );
}

function ReviewCard({
  review,
  reviewFailed,
}: {
  review: ListingGroupReviewResponse | null;
  reviewFailed: boolean;
}) {
  if (!review) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kiểm duyệt</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-warning">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {reviewFailed
              ? 'Không tải được checklist kiểm duyệt.'
              : 'Không có dữ liệu kiểm duyệt.'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasContactLeak = review.contactFlags.length > 0;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Checklist duyệt</CardTitle>
          <CardDescription>
            {review.checklistPassed
              ? 'Tất cả tiêu chí bắt buộc đã đạt.'
              : 'Còn tiêu chí chưa đạt — cần ghi đè để xuất bản.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {review.checklist.map((item) => (
              <li key={item.key} className="flex items-center gap-3 py-3">
                <span
                  className={
                    item.passed
                      ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive'
                  }
                >
                  {item.passed ? <Check className="size-4" /> : <X className="size-4" />}
                </span>
                <span className="text-sm">{CHECKLIST_LABEL[item.key] ?? item.label}</span>
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
          <CardDescription>Gồm cả nội dung từng hạng mục (§7.3)</CardDescription>
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
                  <li
                    key={i}
                    className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
                  >
                    <span className="font-medium">{CONTACT_FLAG_LABEL[flag.type]}</span> trong{' '}
                    <span className="font-medium">{contactFieldLabel(flag.field)}</span>: “{flag.match}”
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CircleCheck className="size-4 shrink-0" /> Không phát hiện thông tin liên hệ bị lộ.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChildCard({ listing }: { listing: ListingResponse }) {
  const price = listingPriceFrom(listing);
  const thumb = listing.photos[0];
  return (
    <div className="flex gap-3 rounded-lg border border-border p-3">
      {thumb ? (
        <a
          href={thumb}
          target="_blank"
          rel="noreferrer"
          className="block size-16 shrink-0 overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <img
            src={thumb}
            alt={listing.title}
            loading="lazy"
            className="size-full object-cover"
          />
        </a>
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          Ảnh
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate font-medium">{listing.title}</p>
          <ListingStatusBadge status={listing.status} />
        </div>
        <div className="flex flex-wrap gap-1">
          {listing.bookingModes.map((mode) => (
            <Badge key={mode} variant="outline" className="font-normal">
              {BOOKING_MODE_LABEL[mode]}
            </Badge>
          ))}
        </div>
        <p className="text-sm">
          <span className="text-muted-foreground">Giá từ </span>
          {price ? <Money value={price} /> : <span className="text-muted-foreground">—</span>}
        </p>
        <EntityRef
          to={`/tenant/listings/${listing.id}/review`}
          name="Xem chi tiết & kiểm duyệt"
          className="text-sm"
        />
      </div>
    </div>
  );
}

// ── Hành động kiểm duyệt ─────────────────────────────────────────────────────

type ActionPayload = { intent: string; force?: string; reason?: string };

function ActionsCard({
  status,
  hiddenBy,
  canPublish,
  reviewFailed,
  hasContactLeak,
  busy,
  onSubmit,
}: {
  status: ListingGroupDetailResponse['status'];
  hiddenBy: ListingGroupDetailResponse['hiddenBy'];
  canPublish: boolean;
  reviewFailed: boolean;
  hasContactLeak: boolean;
  busy: boolean;
  onSubmit: (payload: ActionPayload) => void;
}) {
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hành động kiểm duyệt</CardTitle>
        <CardDescription>Áp dụng cho bài đăng và toàn bộ hạng mục; ghi vào nhật ký kiểm duyệt.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'draft' ? (
          <p className="text-sm text-muted-foreground">
            Bài đăng đang ở trạng thái nháp — đối tác chưa gửi duyệt nên chưa thể xuất bản.
          </p>
        ) : null}

        {status === 'pending_review' ? (
          <div className="space-y-3">
            {!canPublish ? (
              <label className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <Checkbox
                  checked={force}
                  onCheckedChange={(v) => setForce(v === true)}
                  className="mt-0.5"
                />
                <span className="text-foreground">
                  <span className="font-medium">Bỏ qua kiểm tra &amp; xuất bản</span> — xuất bản dù
                  {reviewFailed
                    ? ' chưa xác minh được checklist'
                    : ' checklist chưa đạt'}
                  {hasContactLeak ? ' hoặc còn lộ thông tin liên hệ' : ''}. Hành động ghi đè này được
                  lưu vào nhật ký kiểm duyệt.
                </span>
              </label>
            ) : null}
            <ConfirmButton
              trigger={
                <Button disabled={busy || (!canPublish && !force)}>
                  <Check className="size-4" /> {canPublish ? 'Duyệt & xuất bản' : 'Ghi đè & xuất bản'}
                </Button>
              }
              title="Xuất bản bài đăng này?"
              description={
                canPublish
                  ? 'Bài đăng và toàn bộ hạng mục sẽ hiển thị công khai trên storefront.'
                  : 'Bạn đang ghi đè kết quả kiểm duyệt — bài đăng sẽ hiển thị công khai và quyết định được lưu vào nhật ký.'
              }
              confirmLabel="Xuất bản"
              busy={busy}
              onConfirm={() => onSubmit({ intent: 'publish', force: force ? '1' : '' })}
            />
            <Separator />
            <HideBlock
              status={status}
              reason={reason}
              setReason={setReason}
              busy={busy}
              onConfirm={() => onSubmit({ intent: 'hide', reason })}
            />
          </div>
        ) : null}

        {status === 'published' ? (
          <HideBlock
            status={status}
            reason={reason}
            setReason={setReason}
            busy={busy}
            onConfirm={() => onSubmit({ intent: 'hide', reason })}
          />
        ) : null}

        {status === 'archived' ? (
          <div className="space-y-3">
            {hiddenBy === 'admin' ? (
              <p className="text-sm text-muted-foreground">
                Bài đăng bị ẩn ở cấp quản trị. Mở lại sẽ hiển thị lại trên storefront.
              </p>
            ) : null}
            <ConfirmButton
              trigger={
                <Button variant="outline" disabled={busy}>
                  <Check className="size-4" /> Mở lại
                </Button>
              }
              title="Mở lại bài đăng?"
              description="Bài đăng và toàn bộ hạng mục sẽ được đăng lại lên storefront."
              confirmLabel="Mở lại"
              busy={busy}
              onConfirm={() => onSubmit({ intent: 'republish' })}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HideBlock({
  status,
  reason,
  setReason,
  busy,
  onConfirm,
}: {
  status: 'pending_review' | 'published';
  reason: string;
  setReason: (value: string) => void;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="reason" className="text-sm font-medium">
          Lý do ẩn / từ chối (tuỳ chọn)
        </label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="VD: Ảnh không rõ, thiếu mô tả, lộ số điện thoại…"
        />
      </div>
      <ConfirmButton
        trigger={
          <Button variant="destructive" disabled={busy}>
            <EyeOff className="size-4" />{' '}
            {status === 'pending_review' ? 'Từ chối & ẩn' : 'Ẩn bài đăng'}
          </Button>
        }
        title={status === 'published' ? 'Ẩn bài đăng đang hiển thị?' : 'Từ chối bài đăng này?'}
        description={
          status === 'published'
            ? 'Bài đăng và toàn bộ hạng mục sẽ bị gỡ khỏi storefront ngay lập tức. Lý do được lưu vào nhật ký kiểm duyệt.'
            : 'Bài đăng sẽ chuyển sang trạng thái đã ẩn; đối tác có thể chỉnh sửa và gửi lại. Lý do được lưu vào nhật ký kiểm duyệt.'
        }
        confirmLabel={status === 'published' ? 'Ẩn bài đăng' : 'Từ chối'}
        destructive
        busy={busy}
        onConfirm={onConfirm}
      />
    </div>
  );
}
