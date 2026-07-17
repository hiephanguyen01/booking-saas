import { useState, type ReactNode } from 'react';
import { data as routeData, Link, redirect, useNavigation, useSubmit } from 'react-router';
import type {
  AttributeFieldType,
  BalanceDue,
  BookingMode,
  ListingResponse,
  ListingReviewResponse,
  ListingTypeResponse,
  ModerationActor,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { Separator } from '@booking/ui/components/ui/separator';
import { ConfirmButton } from '~/components/confirm-button';
import { ArrowLeft, Check, CircleAlert, CircleCheck, EyeOff, ShieldCheck, X } from 'lucide-react';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailRow } from '@booking/ui/components/detail/detail-row';
import type { Route } from './+types/review';
import { apiGet, apiPost } from '~/lib/api.server';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { asRecord } from '~/lib/records';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { CONTACT_FIELD_LABEL, CONTACT_FLAG_LABEL } from '~/features/tenant/constants';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { EntityRef } from '~/components/entity-ref';
import { PhotoStrip } from '~/components/photo-strip';
import { ListingStatusBadge, PartnerVerificationBadge } from '~/components/status-badge';

const BALANCE_LABEL: Record<BalanceDue, string> = {
  online_before: 'Trực tuyến trước',
  on_arrival: 'Tại chỗ',
};
/** Moderation actor → Vietnamese; the tenant reviewer acts as `admin` (§7.3). */
const ACTOR_LABEL: Record<ModerationActor, string> = {
  partner: 'Đối tác',
  admin: 'Quản trị',
};
/** Translate the backend's English checklist keys — the label ships in English. */
const CHECKLIST_LABEL: Record<string, string> = {
  photos: 'Có ít nhất 1 ảnh',
  description: 'Có mô tả',
  price: 'Mọi hình thức đặt đều có giá',
  cancellation_policy: 'Có chính sách huỷ',
};
const INVENTORY_UNIT_LABEL: Record<'hour' | 'day', string> = { hour: 'Giờ', day: 'Ngày' };

// ── mode_config readers (the stored config is free-form JSON) ─────────────────

function readStr(value: unknown): string | null {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}
function readNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function numUnit(value: unknown, unit: string): string | null {
  const n = readNum(value);
  return n === null ? null : `${n} ${unit}`;
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
  const listing = listingRes.ok ? listingRes.data : null;

  // The listing type carries the attribute LABELS; a secondary fetch that may
  // fail independently, so the attribute section degrades to raw keys rather
  // than 500-ing the whole review page.
  let listingType: ListingTypeResponse | null = null;
  let listingTypeFailed = false;
  if (listing) {
    const typeRes = await apiGet<ListingTypeResponse>(
      `/tenant/listing-types/${listing.listingTypeId}`,
      auth,
    );
    if (typeRes.ok && typeRes.data) listingType = typeRes.data;
    else listingTypeFailed = true;
  }

  return { listing, review: reviewRes.data, listingType, listingTypeFailed };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const id = params.listingId;

  let res;
  if (intent === 'publish') {
    res = await apiPost(`/tenant/listings/${id}/publish`, { force: form.get('force') === '1' }, auth);
  } else if (intent === 'republish') {
    res = await apiPost(`/tenant/listings/${id}/republish`, {}, auth);
  } else if (intent === 'hide') {
    const reason = String(form.get('reason') ?? '').trim();
    res = await apiPost(`/tenant/listings/${id}/hide`, reason ? { reason } : {}, auth);
  } else {
    return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  }

  if (!res.ok) {
    const error =
      res.code === 'LISTING_HAS_CONTACT_INFO'
        ? 'Listing còn lộ thông tin liên hệ. Tích “Bỏ qua kiểm tra” để xuất bản bất chấp cảnh báo.'
        : (res.error ?? 'Thao tác thất bại.');
    return routeData({ error }, { status: 400 });
  }
  return redirect('/tenant/listings');
}

export default function ReviewListing({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, review, listingType, listingTypeFailed } = loaderData;
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== 'idle';
  const actionError = actionData && 'error' in actionData ? actionData.error : null;

  const hasContactLeak = review.contactFlags.length > 0;
  const canPublish = review.checklistPassed && !hasContactLeak;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/tenant/listings">
          <ArrowLeft className="size-4" /> Danh sách listing
        </Link>
      </Button>

      <PageHeader
        title={listing?.title ?? 'Kiểm duyệt listing'}
        description={listing ? `/${listing.slug}` : undefined}
        actions={<ListingStatusBadge status={review.status} />}
      />

      {actionError ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Không thực hiện được</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {!listing ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertDescription>
            Không tải được chi tiết listing — chỉ hiển thị checklist kiểm duyệt.
          </AlertDescription>
        </Alert>
      ) : null}

      {listing ? <PartnerCard listing={listing} /> : null}

      <ReviewCards review={review} />

      {listing ? <ContentCard listing={listing} /> : null}
      {listing ? <PricingCard listing={listing} /> : null}
      {listing ? <PolicyCard listing={listing} /> : null}
      {listing ? (
        <AttributesCard listing={listing} type={listingType} typeFailed={listingTypeFailed} />
      ) : null}
      {listing ? <ModerationLogCard listing={listing} /> : null}

      <ActionsCard
        status={review.status}
        hiddenBy={listing?.hiddenBy ?? null}
        groupId={listing?.groupId ?? null}
        canPublish={canPublish}
        hasContactLeak={hasContactLeak}
        busy={busy}
        onSubmit={(payload) => submit(payload, { method: 'post' })}
      />
    </div>
  );
}

// ── Đối tác ──────────────────────────────────────────────────────────────────

function PartnerCard({ listing }: { listing: ListingResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Đối tác</CardTitle>
        <CardDescription>Chủ sở hữu listing đang được kiểm duyệt.</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGrid>
          <DetailField
            label="Tên đối tác"
            value={
              <EntityRef to={`/tenant/partners/${listing.partnerId}`} name={listing.partner.name} />
            }
          />
          <DetailField
            label="Xác minh danh tính"
            value={<PartnerVerificationBadge status={listing.partner.verificationStatus} />}
          />
        </DetailGrid>
      </CardContent>
    </Card>
  );
}

// ── Kiểm duyệt (checklist + contact scan) ────────────────────────────────────

function ReviewCards({ review }: { review: ListingReviewResponse }) {
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
                  <li
                    key={i}
                    className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
                  >
                    <span className="font-medium">{CONTACT_FLAG_LABEL[flag.type]}</span> trong{' '}
                    <span className="font-medium">
                      {CONTACT_FIELD_LABEL[flag.field] ?? flag.field}
                    </span>
                    : “{flag.match}”
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

// ── Nội dung (ảnh · mô tả · vị trí) ──────────────────────────────────────────

function ContentCard({ listing }: { listing: ListingResponse }) {
  const hasLocation = Boolean(listing.address || listing.wardName || listing.provinceName);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nội dung</CardTitle>
        <CardDescription>Nội dung đối tác gửi lên để kiểm duyệt.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DetailSection title="Ảnh" emptyMessage="Chưa có ảnh nào.">
          {listing.photos.length > 0 ? <PhotoStrip photos={listing.photos} alt={listing.title} /> : null}
        </DetailSection>

        <DetailSection title="Mô tả" emptyMessage="Chưa có mô tả.">
          {listing.description ? (
            <p className="whitespace-pre-wrap text-sm">{listing.description}</p>
          ) : null}
        </DetailSection>

        <DetailSection title="Vị trí" emptyMessage="Chưa có địa chỉ.">
          {hasLocation ? (
            <DetailGrid columns={2}>
              <DetailField label="Địa chỉ" value={listing.address} span={2} />
              <DetailField label="Phường / Xã" value={listing.wardName} />
              <DetailField label="Tỉnh / Thành" value={listing.provinceName} />
            </DetailGrid>
          ) : null}
        </DetailSection>
      </CardContent>
    </Card>
  );
}

// ── Giá & hình thức đặt ──────────────────────────────────────────────────────

function PricingCard({ listing }: { listing: ListingResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Giá &amp; hình thức đặt</CardTitle>
        <CardDescription>Toàn bộ cấu hình giá mà khách sẽ bị tính.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {listing.bookingModes.map((mode) => (
          <ModeBlock key={mode} mode={mode} config={asRecord(listing.modeConfig[mode])} />
        ))}
      </CardContent>
    </Card>
  );
}

function ModeBlock({
  mode,
  config,
}: {
  mode: BookingMode;
  config: Record<string, unknown> | null;
}) {
  return (
    <DetailSection title={BOOKING_MODE_LABEL[mode]} emptyMessage="Chưa cấu hình giá cho hình thức này.">
      {config ? <ModeFields mode={mode} config={config} /> : null}
    </DetailSection>
  );
}

function ModeFields({ mode, config }: { mode: BookingMode; config: Record<string, unknown> }) {
  if (mode === 'hourly') {
    return (
      <div className="space-y-3">
        <DetailGrid columns={3}>
          <DetailField
            label="Giá cơ bản"
            emphasis="strong"
            hint="mỗi giờ"
            value={<Money value={readStr(config.basePrice)} />}
          />
          <DetailField label="Thời lượng tối thiểu" value={numUnit(config.minDuration, 'giờ')} />
          <DetailField label="Thời lượng tối đa" value={numUnit(config.maxDuration, 'giờ')} />
          <DetailField label="Bước đặt" value={numUnit(config.granularity, 'phút')} />
          <DetailField label="Đặt trước tối thiểu" value={numUnit(config.leadTimeMin, 'phút')} />
        </DetailGrid>
        <PriceBlocks blocks={config.blocks} unitKey="hours" unitLabel="giờ" />
      </div>
    );
  }
  if (mode === 'daily') {
    return (
      <div className="space-y-3">
        <DetailGrid columns={3}>
          <DetailField
            label="Giá mỗi đêm"
            emphasis="strong"
            value={<Money value={readStr(config.basePricePerNight)} />}
          />
          <DetailField label="Số đêm tối thiểu" value={numUnit(config.minNights, 'đêm')} />
          <DetailField label="Số đêm tối đa" value={numUnit(config.maxNights, 'đêm')} />
          <DetailField label="Giờ nhận phòng" value={readStr(config.checkinTime)} />
          <DetailField label="Giờ trả phòng" value={readStr(config.checkoutTime)} />
          <DetailField label="Đặt trước tối thiểu" value={numUnit(config.leadTimeMin, 'phút')} />
        </DetailGrid>
        <PriceBlocks blocks={config.blocks} unitKey="days" unitLabel="đêm" />
      </div>
    );
  }
  if (mode === 'inventory') {
    const unit = readInventoryUnit(config.unit);
    const unitWord = unit === 'day' ? 'ngày' : 'giờ';
    const lateFee = readStr(config.lateFeePerUnit) ?? readStr(config.basePrice);
    return (
      <DetailGrid columns={3}>
        <DetailField
          label="Đơn vị thuê"
          value={unit ? <EnumValue map={INVENTORY_UNIT_LABEL} value={unit} /> : null}
        />
        <DetailField
          label="Giá thuê"
          emphasis="strong"
          hint={`mỗi ${unitWord}`}
          value={<Money value={readStr(config.basePrice)} />}
        />
        <DetailField label="Tiền cọc" value={<Money value={readStr(config.securityDeposit)} />} />
        <DetailField label="Tối thiểu" value={numUnit(config.minDuration, unitWord)} omitWhenEmpty />
        <DetailField label="Tối đa" value={numUnit(config.maxDuration, unitWord)} omitWhenEmpty />
        <DetailField
          label="Phí trả trễ"
          hint={`mỗi ${unitWord} quá hạn`}
          value={lateFee ? <Money value={lateFee} /> : null}
        />
      </DetailGrid>
    );
  }
  // appointment / class carry no priced mode_config in Phase 1.
  return <p className="text-sm text-muted-foreground">Hình thức này chưa có cấu hình giá riêng.</p>;
}

function readInventoryUnit(value: unknown): 'hour' | 'day' | null {
  return value === 'hour' || value === 'day' ? value : null;
}

function PriceBlocks({
  blocks,
  unitKey,
  unitLabel,
}: {
  blocks: unknown;
  unitKey: 'hours' | 'days';
  unitLabel: string;
}) {
  const rows = (Array.isArray(blocks) ? blocks : [])
    .map(asRecord)
    .map((r) => (r ? { n: readNum(r[unitKey]), price: readStr(r.price) } : null))
    .filter((r): r is { n: number; price: string } => r !== null && r.n !== null && r.price !== null);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gói ưu đãi</p>
      {rows.map((r, i) => (
        <DetailRow key={i} label={`${r.n} ${unitLabel}`} value={<Money value={r.price} />} />
      ))}
    </div>
  );
}

// ── Chính sách ───────────────────────────────────────────────────────────────

function PolicyCard({ listing }: { listing: ListingResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chính sách</CardTitle>
        <CardDescription>Điều khoản áp dụng cho mọi lượt đặt của listing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DetailGrid columns={3}>
          <DetailField label="Đặt cọc" value={`${listing.depositPercent}%`} />
          <DetailField
            label="Thanh toán còn lại"
            value={<EnumValue map={BALANCE_LABEL} value={listing.balanceDue} />}
          />
          <DetailField label="Yêu cầu duyệt đặt" value={listing.approvalRequired ? 'Có' : 'Không'} />
          <DetailField label="Đệm trước" value={`${listing.bufferBefore} phút`} />
          <DetailField label="Đệm sau" value={`${listing.bufferAfter} phút`} />
          <DetailField
            label="Tồn kho"
            value={listing.stockQuantity !== null ? String(listing.stockQuantity) : null}
            omitWhenEmpty
          />
          <DetailField
            label="Sức chứa"
            value={listing.capacity !== null ? String(listing.capacity) : null}
            omitWhenEmpty
          />
        </DetailGrid>

        <DetailSection title="Chính sách huỷ" emptyMessage="Chưa gắn chính sách huỷ.">
          {listing.cancellationPolicy ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{listing.cancellationPolicy.name}</p>
              <CancellationRules rules={listing.cancellationPolicy.rules} />
            </div>
          ) : null}
        </DetailSection>

        <DetailSection title="Đổi lịch">
          <DetailGrid columns={3}>
            <DetailField
              label="Cho phép đổi lịch"
              value={listing.rescheduleAllowed ? 'Có' : 'Không'}
            />
            {listing.rescheduleAllowed ? (
              <>
                <DetailField
                  label="Hạn đổi lịch"
                  value={
                    listing.rescheduleDeadlineHours !== null
                      ? `Trước ${listing.rescheduleDeadlineHours} giờ`
                      : 'Không giới hạn'
                  }
                />
                <DetailField
                  label="Phí đổi lịch"
                  value={
                    listing.rescheduleFee !== null ? (
                      <Money value={listing.rescheduleFee} />
                    ) : (
                      'Miễn phí'
                    )
                  }
                />
              </>
            ) : null}
          </DetailGrid>
        </DetailSection>
      </CardContent>
    </Card>
  );
}

function CancellationRules({ rules }: { rules: unknown }) {
  const tiers = (Array.isArray(rules) ? rules : [])
    .map(asRecord)
    .map((r) => (r ? { hoursBefore: readNum(r.hoursBefore), refundPercent: readNum(r.refundPercent) } : null))
    .filter(
      (t): t is { hoursBefore: number; refundPercent: number } =>
        t !== null && t.hoursBefore !== null && t.refundPercent !== null,
    )
    .sort((a, b) => b.hoursBefore - a.hoursBefore);

  if (tiers.length === 0) {
    return <p className="text-sm text-muted-foreground">Không có mốc hoàn tiền cụ thể.</p>;
  }
  return (
    <div className="space-y-1">
      {tiers.map((t, i) => (
        <DetailRow
          key={i}
          label={cancellationTierLabel(t.hoursBefore)}
          value={`Hoàn ${Math.max(0, Math.min(100, t.refundPercent))}%`}
        />
      ))}
    </div>
  );
}

function cancellationTierLabel(hoursBefore: number): string {
  if (hoursBefore <= 0) return 'Sát giờ / sau khi bắt đầu';
  return hoursBefore % 24 === 0 ? `Huỷ trước ${hoursBefore / 24} ngày` : `Huỷ trước ${hoursBefore} giờ`;
}

// ── Thuộc tính ───────────────────────────────────────────────────────────────

function AttributesCard({
  listing,
  type,
  typeFailed,
}: {
  listing: ListingResponse;
  type: ListingTypeResponse | null;
  typeFailed: boolean;
}) {
  const entries = Object.entries(listing.attributes ?? {});
  if (entries.length === 0) return null;

  const fields = type?.attributeSchema ?? [];
  const labelOf = (key: string): string => fields.find((f) => f.key === key)?.label ?? key;
  const typeOf = (key: string): AttributeFieldType | undefined =>
    fields.find((f) => f.key === key)?.type;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thuộc tính</CardTitle>
        {typeFailed ? (
          <CardDescription className="text-warning">
            Không tải được nhãn thuộc tính — đang hiển thị khoá gốc.
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <DetailGrid columns={3}>
          {entries.map(([key, value]) => (
            <DetailField key={key} label={labelOf(key)} value={formatAttrValue(value, typeOf(key))} />
          ))}
        </DetailGrid>
      </CardContent>
    </Card>
  );
}

function formatAttrValue(value: unknown, type?: AttributeFieldType): ReactNode {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : null;
  if (typeof value === 'boolean' || type === 'boolean') return value ? 'Có' : 'Không';
  return String(value);
}

// ── Trạng thái & nhật ký ─────────────────────────────────────────────────────

function ModerationLogCard({ listing }: { listing: ListingResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trạng thái &amp; nhật ký</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailGrid columns={3}>
          <DetailField
            label="Xuất bản bởi"
            value={listing.publishedBy ? <EnumValue map={ACTOR_LABEL} value={listing.publishedBy} /> : null}
          />
          <DetailField
            label="Ẩn bởi"
            value={listing.hiddenBy ? <EnumValue map={ACTOR_LABEL} value={listing.hiddenBy} /> : null}
          />
          <DetailField
            label="Gửi duyệt lúc"
            value={listing.submittedAt ? <DateTimeValue iso={listing.submittedAt} /> : null}
          />
          <DetailField
            label="Xuất bản lần đầu"
            value={listing.publishedAt ? <DateTimeValue iso={listing.publishedAt} /> : null}
          />
          <DetailField label="Tạo lúc" value={<DateTimeValue iso={listing.createdAt} />} />
          <DetailField label="Cập nhật lúc" value={<DateTimeValue iso={listing.updatedAt} relative />} />
        </DetailGrid>
      </CardContent>
    </Card>
  );
}

// ── Hành động kiểm duyệt ─────────────────────────────────────────────────────

type ActionPayload = { intent: string; force?: string; reason?: string };

function ActionsCard({
  status,
  hiddenBy,
  groupId,
  canPublish,
  hasContactLeak,
  busy,
  onSubmit,
}: {
  status: ListingReviewResponse['status'];
  hiddenBy: ModerationActor | null;
  groupId: string | null;
  canPublish: boolean;
  hasContactLeak: boolean;
  busy: boolean;
  onSubmit: (payload: ActionPayload) => void;
}) {
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState('');
  const canHide = status === 'published' || status === 'pending_review';

  // A grouped listing is moderated as part of its parent post — the backend
  // rejects publish/hide/republish on the child (GROUP_MANAGED_LISTING).
  if (groupId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hành động kiểm duyệt</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Listing này thuộc một bài đăng nhóm và được kiểm duyệt cùng bài đăng.{' '}
            <EntityRef to={`/tenant/listing-groups/${groupId}/review`} name="Kiểm duyệt bài đăng" />.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hành động kiểm duyệt</CardTitle>
        <CardDescription>Quyết định sẽ được ghi vào nhật ký kiểm duyệt.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'draft' ? (
          <p className="text-sm text-muted-foreground">
            Listing đang ở trạng thái nháp — đối tác chưa gửi duyệt nên chưa thể xuất bản.
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
                  checklist chưa đạt{hasContactLeak ? ' hoặc còn lộ thông tin liên hệ' : ''}. Hành động
                  ghi đè này được lưu vào nhật ký kiểm duyệt.
                </span>
              </label>
            ) : null}
            <ConfirmButton
              trigger={
                <Button disabled={busy || (!canPublish && !force)}>
                  <Check className="size-4" /> {canPublish ? 'Duyệt & xuất bản' : 'Ghi đè & xuất bản'}
                </Button>
              }
              title="Xuất bản listing này?"
              description={
                canPublish
                  ? 'Listing sẽ hiển thị công khai trên storefront và bắt đầu nhận đặt chỗ.'
                  : 'Bạn đang ghi đè kết quả kiểm duyệt — listing sẽ hiển thị công khai và quyết định được lưu vào nhật ký.'
              }
              confirmLabel="Xuất bản"
              busy={busy}
              onConfirm={() => onSubmit({ intent: 'publish', force: force ? '1' : '' })}
            />
          </div>
        ) : null}

        {status === 'archived' ? (
          <div className="space-y-3">
            {hiddenBy === 'admin' ? (
              <p className="text-sm text-muted-foreground">
                Listing bị ẩn ở cấp quản trị. Mở lại sẽ hiển thị lại trên storefront.
              </p>
            ) : null}
            <ConfirmButton
              trigger={
                <Button variant="outline" disabled={busy}>
                  <Check className="size-4" /> Hiển thị lại
                </Button>
              }
              title="Hiển thị lại listing?"
              description="Listing sẽ được đăng lại lên storefront và tiếp tục nhận đặt chỗ."
              confirmLabel="Hiển thị lại"
              busy={busy}
              onConfirm={() => onSubmit({ intent: 'republish' })}
            />
          </div>
        ) : null}

        {canHide ? (
          <>
            {status === 'pending_review' ? <Separator /> : null}
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
                    {status === 'pending_review' ? 'Từ chối & ẩn' : 'Ẩn listing'}
                  </Button>
                }
                title={status === 'published' ? 'Ẩn listing đang hiển thị?' : 'Từ chối listing này?'}
                description={
                  status === 'published'
                    ? 'Listing sẽ bị gỡ khỏi storefront ngay lập tức và ngừng nhận đặt chỗ mới. Lý do được lưu vào nhật ký kiểm duyệt.'
                    : 'Listing sẽ chuyển sang trạng thái đã ẩn; đối tác có thể chỉnh sửa và gửi lại. Lý do được lưu vào nhật ký kiểm duyệt.'
                }
                confirmLabel={status === 'published' ? 'Ẩn listing' : 'Từ chối'}
                destructive
                busy={busy}
                onConfirm={() => onSubmit({ intent: 'hide', reason })}
              />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
