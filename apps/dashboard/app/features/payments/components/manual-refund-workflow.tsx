import {
  completeManualRefundTransferInputSchema,
  rejectManualRefundInputSchema,
  revealManualRefundPrivateDetailsInputSchema,
  verifyManualRefundDestinationInputSchema,
  type ManualRefundDetailResponse,
  type ManualRefundListItem,
  type ManualRefundListResponse,
  type ManualRefundOperationStatus,
  type ManualRefundPrivateDetailsResponse,
  generateVietQrPayload,
  getBankByBinOrCode,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Image } from '@booking/ui/components/media/image';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
  Zap,
} from 'lucide-react';
import { Form, Link, useSearchParams } from 'react-router';
import { MANUAL_REFUND_STATUS_LABEL } from '~/constants/payments';
import { dashboardPaths } from '~/constants/paths';
import { formatDateTime, formatVnd } from '~/lib/format';

const VERIFICATION_RESULT_LABEL: Record<string, string> = {
  matched: 'Khớp tài khoản',
  mismatch: 'Không khớp tên',
  unsupported: 'Chưa hỗ trợ tra cứu',
  error: 'Lỗi tra cứu',
};

export interface ManualRefundActionData {
  operationId?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  success?: string;
  privateDetails?: ManualRefundPrivateDetailsResponse;
}

interface Permissions {
  prepare: boolean;
  approve: boolean;
  reveal: boolean;
}

interface MakerOption {
  value: string;
  label: string;
}

const STATUS_FILTERS: Array<{ value: ManualRefundOperationStatus | ''; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'awaiting_details', label: 'Chờ khách' },
  { value: 'verification_required', label: 'Cần xác minh' },
  { value: 'ready_for_transfer', label: 'Sẵn sàng chuyển' },
  { value: 'transfer_submitted', label: 'Chờ duyệt' },
  { value: 'correction_required', label: 'Cần chỉnh sửa' },
  { value: 'transfer_rejected', label: 'Bị từ chối' },
  { value: 'completed', label: 'Hoàn tất' },
];

function statusClass(status: ManualRefundOperationStatus): string {
  if (status === 'completed') return 'border-success/30 bg-success/10 text-success';
  if (status === 'correction_required' || status === 'transfer_rejected') {
    return 'border-destructive/30 bg-destructive/10 text-destructive';
  }
  if (status === 'ready_for_transfer') return 'border-info/30 bg-info/10 text-info';
  return 'border-warning/30 bg-warning/10 text-warning';
}

function selectedHref(searchParams: URLSearchParams, operationId: string): string {
  const next = new URLSearchParams(searchParams);
  next.set('refundOperation', operationId);
  return `${dashboardPaths.tenant.transactions}?${next.toString()}`;
}

function queueLabel(item: ManualRefundListItem): string {
  return MANUAL_REFUND_STATUS_LABEL[item.status];
}

export function ManualRefundWorkflow({
  queue,
  detail,
  permissions,
  currentUserId: _currentUserId,
  makerOptions: _makerOptions,
  actionData,
  error,
  nowIso,
}: {
  queue: ManualRefundListResponse;
  detail: ManualRefundDetailResponse | null;
  permissions: Permissions;
  currentUserId?: string;
  makerOptions?: MakerOption[];
  actionData?: ManualRefundActionData;
  error: string | null;
  nowIso: string;
}) {
  const [searchParams] = useSearchParams();
  const dueItems = queue.items.filter((item) =>
    item.transferDueAt && item.status !== 'completed'
      ? new Date(item.transferDueAt).getTime() < new Date(nowIso).getTime()
      : false,
  ).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="size-5 text-primary" /> Điều phối hoàn tiền thủ công
            </CardTitle>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Quét mã VietQR chuyển tiền trực tiếp cho khách và xác nhận mã giao dịch 1 bước nhanh
              chóng. Thông tin tài khoản được mã hoá và bảo vệ an toàn.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">{queue.total} batch</Badge>
            {dueItems > 0 ? (
              <Badge variant="outline" className="border-destructive/30 text-destructive">
                {dueItems} quá hạn
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error ? (
          <p className="m-4 flex items-center gap-2 text-sm text-destructive" role="alert">
            <CircleAlert className="size-4" /> {error}
          </p>
        ) : null}

        <div className="border-b p-4">
          <Form method="get" className="flex flex-wrap gap-2" aria-label="Lọc hoàn tiền thủ công">
            {STATUS_FILTERS.map((option) => (
              <Button
                key={option.value || 'all'}
                type="submit"
                name="refundStatus"
                value={option.value}
                size="sm"
                variant={
                  (searchParams.get('refundStatus') ?? '') === option.value ? 'default' : 'outline'
                }
              >
                {option.label}
              </Button>
            ))}
            <Button
              type="submit"
              name="refundOverdue"
              value="true"
              size="sm"
              variant={searchParams.get('refundOverdue') === 'true' ? 'destructive' : 'outline'}
            >
              Quá hạn SLA
            </Button>
          </Form>
        </div>

        <div className="grid min-h-96 lg:grid-cols-[minmax(19rem,0.8fr)_minmax(28rem,1.2fr)]">
          <div className="border-b lg:border-b-0 lg:border-r">
            {queue.items.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                <CheckCircle2 className="size-8 text-success" />
                <p className="mt-3 font-medium">Không có batch trong hàng đợi này</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Các khoản cần thao tác sẽ xuất hiện sau khi cổng thanh toán chuyển sang hoàn thủ
                  công.
                </p>
              </div>
            ) : (
              <ul className="divide-y" aria-label="Danh sách batch hoàn tiền">
                {queue.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={selectedHref(searchParams, item.id)}
                      className={`flex gap-3 p-4 transition-colors hover:bg-muted/50 ${detail?.id === item.id ? 'bg-muted/60' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-sm font-semibold">
                            {item.bookingCode}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {formatVnd(item.amount)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={statusClass(item.status)}>
                            {queueLabel(item)}
                          </Badge>
                          {item.transferDueAt ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock3 className="size-3" /> {formatDateTime(item.transferDueAt)}
                            </span>
                          ) : null}
                        </div>
                        {item.destination ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {item.destination.bankCode} · •••• {item.destination.accountNumberLast4}
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-5 lg:p-6">
            {detail ? (
              <ManualRefundDetail
                detail={detail}
                permissions={permissions}
                actionData={actionData}
              />
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <ShieldCheck className="size-9 text-muted-foreground" />
                <p className="mt-3 font-medium">Chọn một yêu cầu để xử lý</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Chọn một giao dịch hoàn tiền để xem thông tin tài khoản và quét mã VietQR chuyển
                  trả cho khách.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ManualRefundDetail({
  detail,
  permissions,
  actionData,
}: {
  detail: ManualRefundDetailResponse;
  permissions: Permissions;
  actionData?: ManualRefundActionData;
}) {
  const commonTransform = (intent: string) => (values: Record<string, unknown>) => ({
    ...values,
    intent,
    operationId: detail.id,
  });
  const scopedActionData =
    !actionData?.operationId || actionData.operationId === detail.id ? actionData : undefined;
  const serverError = scopedActionData?.error ?? null;
  const privateDetails = scopedActionData?.privateDetails;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={dashboardPaths.tenant.booking(detail.bookingId)}
            className="font-mono text-lg font-semibold text-primary hover:underline"
          >
            {detail.bookingCode}
          </Link>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatVnd(detail.amount)}</p>
        </div>
        <Badge variant="outline" className={statusClass(detail.status)}>
          {MANUAL_REFUND_STATUS_LABEL[detail.status]}
        </Badge>
      </div>

      <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
        <Fact
          label="Tài khoản nhận"
          value={
            detail.destination
              ? `${detail.destination.bankCode} · •••• ${detail.destination.accountNumberLast4}`
              : 'Chưa có'
          }
        />
        <Fact
          label="Xác minh"
          value={
            detail.verificationResult
              ? (VERIFICATION_RESULT_LABEL[detail.verificationResult] ?? detail.verificationResult)
              : 'Chưa xác minh'
          }
        />
        <Fact
          label="SLA chuyển tiền"
          value={detail.transferDueAt ? formatDateTime(detail.transferDueAt) : 'Chưa bắt đầu'}
        />
        {detail.transferReference ? (
          <Fact label="Mã giao dịch" value={detail.transferReference} />
        ) : null}
        <Fact label="Biên lai" value={detail.evidence.present ? 'Đã nộp' : 'Chưa nộp'} />
      </div>

      {scopedActionData?.success ? (
        <p
          className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success"
          role="status"
        >
          <CheckCircle2 className="size-4" /> {scopedActionData.success}
        </p>
      ) : null}

      {privateDetails ? (
        <div className="space-y-4">
          <div
            className="rounded-lg border border-warning/40 bg-warning/10 p-4"
            role="region"
            aria-label="Thông tin tài khoản vừa mở"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Eye className="size-4" /> Thông tin nhạy cảm · không sao chép vào ghi chú
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <Fact label="Ngân hàng" value={privateDetails.bankCode} />
              <Fact label="Chủ tài khoản" value={privateDetails.accountName} />
              <Fact label="Số tài khoản" value={privateDetails.accountNumber} />
              {privateDetails.evidenceDownload ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Biên lai</dt>
                  <dd>
                    <a
                      className="font-medium text-primary hover:underline"
                      href={privateDetails.evidenceDownload.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mở liên kết ngắn hạn
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <VietQrCodeView
            bankCode={privateDetails.bankCode}
            accountNumber={privateDetails.accountNumber}
            accountName={privateDetails.accountName}
            amount={detail.amount}
            bookingCode={detail.bookingCode}
          />
        </div>
      ) : null}

      {permissions.reveal && detail.destination && !detail.ciphertextPurgedAt ? (
        <ActionSection icon={<LockKeyhole className="size-4" />} title="Mở thông tin tài khoản">
          <GenericForm
            schema={revealManualRefundPrivateDetailsInputSchema}
            fields={[
              {
                name: 'reason',
                type: 'text',
                label: 'Lý do truy cập',
                required: true,
                description: 'Mỗi lần mở đều được ghi audit.',
              },
            ]}
            defaultValues={{ reason: '' }}
            transform={commonTransform('reveal')}
            submitLabel="Mở trong phiên này"
            submitPendingLabel="Đang kiểm tra quyền…"
            serverError={serverError}
          />
        </ActionSection>
      ) : null}

      {permissions.prepare && detail.status === 'verification_required' ? (
        <ActionSection icon={<UserRoundCheck className="size-4" />} title="Xác minh thủ công">
          <GenericForm
            schema={verifyManualRefundDestinationInputSchema}
            fields={[
              { name: 'note', type: 'textarea', rows: 3, label: 'Căn cứ xác minh', required: true },
            ]}
            defaultValues={{ expectedVersion: detail.version, outcome: 'matched', note: '' }}
            transform={commonTransform('verify')}
            submitLabel="Xác nhận tài khoản khớp"
            serverError={serverError}
          />
        </ActionSection>
      ) : null}

      {permissions.prepare && detail.status === 'ready_for_transfer' ? (
        <ActionSection
          icon={<Zap className="size-4 text-primary" />}
          title="Chi hộ tự động qua API (1 Chạm)"
        >
          <p className="mb-3 text-sm text-muted-foreground">
            Chuyển khoản trực tiếp tới tài khoản khách hàng thông qua cổng kết nối ngân hàng 24/7.
            Tiền được giải ngân ngay lập tức và đơn tự động hoàn tất mà không cần quét mã QR thủ
            công.
          </p>
          <Form method="post" className="inline-block">
            <input type="hidden" name="intent" value="auto-payout" />
            <input type="hidden" name="operationId" value={detail.id} />
            <input type="hidden" name="expectedVersion" value={detail.version} />
            <Button type="submit" variant="default" className="font-semibold">
              <Zap className="size-4 mr-1.5" /> Thực hiện chi hộ tự động ({formatVnd(detail.amount)}
              )
            </Button>
          </Form>
        </ActionSection>
      ) : null}

      {permissions.prepare &&
      (detail.status === 'ready_for_transfer' || detail.status === 'transfer_submitted') ? (
        <ActionSection
          icon={<CheckCircle2 className="size-4 text-success" />}
          title="Chuyển khoản thủ công VietQR (Quy trình 1 bước)"
        >
          <p className="mb-3 text-sm text-muted-foreground">
            Sau khi bạn đã quét mã VietQR và chuyển tiền cho khách trên app ngân hàng, hãy nhập mã
            giao dịch để hoàn tất đơn ngay lập tức (không cần duyệt 4 mắt).
          </p>
          <GenericForm
            schema={completeManualRefundTransferInputSchema}
            fields={[
              {
                name: 'reference',
                type: 'text',
                label: 'Mã giao dịch ngân hàng (FT... hoặc mã tham chiếu)',
                required: true,
                autoComplete: 'off',
                placeholder: 'Ví dụ: FT26091512345678',
              },
              {
                name: 'note',
                type: 'text',
                label: 'Ghi chú nội bộ (không bắt buộc)',
                required: false,
                placeholder: 'Đã chuyển khoản hoàn 100% qua app ngân hàng',
              },
            ]}
            defaultValues={{ expectedVersion: detail.version, reference: '', note: '' }}
            transform={commonTransform('complete-transfer')}
            submitLabel="Xác nhận đã hoàn tiền cho khách"
            submitPendingLabel="Đang ghi nhận…"
            serverError={serverError}
          />
        </ActionSection>
      ) : null}

      {permissions.approve &&
      ['correction_required', 'transfer_rejected'].includes(detail.status) ? (
        <ActionSection icon={<CircleAlert className="size-4" />} title="Mở lại thông tin nhận tiền">
          <GenericForm
            schema={rejectManualRefundInputSchema}
            fields={[
              {
                name: 'reason',
                type: 'textarea',
                rows: 2,
                label: 'Lý do yêu cầu khách khai báo lại',
                required: true,
              },
            ]}
            defaultValues={{ expectedVersion: detail.version, reason: '' }}
            transform={commonTransform('reopen')}
            submitLabel="Mở lại cho khách"
            serverError={serverError}
          />
        </ActionSection>
      ) : null}

      {detail.status === 'awaiting_details' ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Đang chờ khách gửi tài khoản qua liên kết đăng nhập hoặc OTP. Timer 48 giờ chỉ nhắc và
          escalates, không tự huỷ khoản hoàn.
        </p>
      ) : null}
      {detail.status === 'completed' ? (
        <p className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-4 text-sm text-success">
          <CheckCircle2 className="size-4" /> Batch đã hoàn tất; booking và settlement sẽ được đồng
          bộ bởi consumer hiện tại.
        </p>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value}</dd>
    </div>
  );
}

function ActionSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function VietQrCodeView({
  bankCode,
  accountNumber,
  accountName,
  amount,
  bookingCode,
}: {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amount: bigint | string;
  bookingCode: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    try {
      const payload = generateVietQrPayload({
        bankCodeOrBin: bankCode,
        accountNumber,
        amountVnd: amount,
        memo: `HOAN TIEN ${bookingCode}`,
      });

      QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 280,
        color: { dark: '#000000', light: '#ffffff' },
      })
        .then((url) => {
          if (active) setQrDataUrl(url);
        })
        .catch((err) => {
          console.error('Failed to generate VietQR:', err);
        });
    } catch (err) {
      console.error('Failed to prepare VietQR payload:', err);
    }

    return () => {
      active = false;
    };
  }, [bankCode, accountNumber, amount, bookingCode]);

  const bankInfo = getBankByBinOrCode(bankCode);

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-5 text-center sm:flex-row sm:text-left sm:gap-6">
      {qrDataUrl ? (
        <Image
          src={qrDataUrl}
          alt="Mã VietQR chuyển tiền hoàn"
          className="h-44 w-44 rounded-lg border bg-background p-2 shadow-sm object-contain"
        />
      ) : (
        <div className="flex h-44 w-44 items-center justify-center rounded-lg border bg-muted/40 text-xs text-muted-foreground">
          Đang tạo mã VietQR…
        </div>
      )}
      <div className="mt-3 sm:mt-0">
        <h4 className="font-semibold text-foreground">Quét mã chuyển tiền qua App Ngân hàng</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Mở app ngân hàng (MB, Vietcombank, Techcombank...) quét mã QR trên để chuyển nhanh{' '}
          <strong>{formatVnd(amount)}</strong> cho khách.
        </p>
        <div className="mt-2 text-xs space-y-1 text-muted-foreground">
          <div>
            • Người nhận:{' '}
            <span className="font-semibold text-foreground uppercase">{accountName}</span>
          </div>
          <div>
            • Số tài khoản:{' '}
            <span className="font-mono font-semibold text-foreground">{accountNumber}</span> (
            {bankInfo?.shortName ?? bankCode})
          </div>
          <div>
            • Số tiền: <span className="font-semibold text-primary">{formatVnd(amount)}</span>
          </div>
          <div>
            • Cú pháp CK:{' '}
            <span className="font-mono font-medium text-foreground">HOAN TIEN {bookingCode}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
