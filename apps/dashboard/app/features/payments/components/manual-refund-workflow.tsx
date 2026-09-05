import {
  approveManualRefundInputSchema,
  claimManualRefundInputSchema,
  rejectManualRefundInputSchema,
  reassignManualRefundInputSchema,
  revealManualRefundPrivateDetailsInputSchema,
  submitManualRefundTransferInputSchema,
  verifyManualRefundDestinationInputSchema,
  type ManualRefundDetailResponse,
  type ManualRefundListItem,
  type ManualRefundListResponse,
  type ManualRefundOperationStatus,
  type ManualRefundPrivateDetailsResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Separator } from '@booking/ui/components/ui/separator';
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react';
import { Form, Link, useSearchParams } from 'react-router';
import { MANUAL_REFUND_STATUS_LABEL } from '~/constants/payments';
import { dashboardPaths } from '~/constants/paths';
import { formatDateTime, formatVnd } from '~/lib/format';
import { ManualRefundEvidenceUpload } from './manual-refund-evidence-upload';

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
  if (item.status === 'ready_for_transfer' && item.makerUserId) return 'Đang chuyển tiền';
  return MANUAL_REFUND_STATUS_LABEL[item.status];
}

export function ManualRefundWorkflow({
  queue,
  detail,
  permissions,
  currentUserId,
  makerOptions,
  actionData,
  error,
  nowIso,
}: {
  queue: ManualRefundListResponse;
  detail: ManualRefundDetailResponse | null;
  permissions: Permissions;
  currentUserId: string;
  makerOptions: MakerOption[];
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
              Một giao dịch ngân hàng cho toàn bộ batch. Maker chuyển tiền, checker khác người xác
              nhận biên lai; thông tin tài khoản luôn được che mặc định.
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
                variant={(searchParams.get('refundStatus') ?? '') === option.value ? 'default' : 'outline'}
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
                  Các khoản cần thao tác sẽ xuất hiện sau khi cổng thanh toán chuyển sang hoàn thủ công.
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
                          <span className="font-mono text-sm font-semibold">{item.bookingCode}</span>
                          <span className="font-semibold tabular-nums">{formatVnd(item.amount)}</span>
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
                currentUserId={currentUserId}
                makerOptions={makerOptions}
                actionData={actionData}
              />
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <ShieldCheck className="size-9 text-muted-foreground" />
                <p className="mt-3 font-medium">Chọn một batch để xử lý</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Thao tác được mở theo đúng trạng thái và quyền maker/checker của bạn.
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
  currentUserId,
  makerOptions,
  actionData,
}: {
  detail: ManualRefundDetailResponse;
  permissions: Permissions;
  currentUserId: string;
  makerOptions: MakerOption[];
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
  const isMaker = detail.makerUserId === currentUserId;

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
        <Fact label="Tài khoản nhận" value={detail.destination ? `${detail.destination.bankCode} · •••• ${detail.destination.accountNumberLast4}` : 'Chưa có'} />
        <Fact label="Xác minh" value={detail.verificationResult ?? 'Chưa xác minh'} />
        <Fact label="Maker" value={detail.makerUserId ? (isMaker ? 'Bạn đang xử lý' : 'Đã có người nhận') : 'Chưa có'} />
        <Fact label="SLA chuyển tiền" value={detail.transferDueAt ? formatDateTime(detail.transferDueAt) : 'Chưa bắt đầu'} />
        {detail.transferReference ? <Fact label="Mã giao dịch" value={detail.transferReference} /> : null}
        <Fact label="Biên lai" value={detail.evidence.present ? 'Đã nộp' : 'Chưa nộp'} />
      </div>

      {scopedActionData?.success ? (
        <p className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success" role="status">
          <CheckCircle2 className="size-4" /> {scopedActionData.success}
        </p>
      ) : null}

      {privateDetails ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4" role="region" aria-label="Thông tin tài khoản vừa mở">
          <div className="flex items-center gap-2 font-semibold"><Eye className="size-4" /> Thông tin nhạy cảm · không sao chép vào ghi chú</div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Fact label="Ngân hàng" value={privateDetails.bankCode} />
            <Fact label="Chủ tài khoản" value={privateDetails.accountName} />
            <Fact label="Số tài khoản" value={privateDetails.accountNumber} />
            {privateDetails.evidenceDownload ? (
              <div><dt className="text-xs text-muted-foreground">Biên lai</dt><dd><a className="font-medium text-primary hover:underline" href={privateDetails.evidenceDownload.downloadUrl} target="_blank" rel="noreferrer">Mở liên kết ngắn hạn</a></dd></div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {permissions.reveal && detail.destination && !detail.ciphertextPurgedAt ? (
        <ActionSection icon={<LockKeyhole className="size-4" />} title="Mở thông tin tài khoản">
          <GenericForm
            schema={revealManualRefundPrivateDetailsInputSchema}
            fields={[{ name: 'reason', type: 'text', label: 'Lý do truy cập', required: true, description: 'Mỗi lần mở đều được ghi audit.' }]}
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
            fields={[{ name: 'note', type: 'textarea', rows: 3, label: 'Căn cứ xác minh', required: true }]}
            defaultValues={{ expectedVersion: detail.version, outcome: 'matched', note: '' }}
            transform={commonTransform('verify')}
            submitLabel="Xác nhận tài khoản khớp"
            serverError={serverError}
          />
        </ActionSection>
      ) : null}

      {permissions.prepare && detail.status === 'ready_for_transfer' && !detail.makerUserId ? (
        <ActionSection icon={<WalletCards className="size-4" />} title="Nhận xử lý batch">
          <p className="mb-3 text-sm text-muted-foreground">Khi nhận, snapshot tài khoản được khóa cho giao dịch này.</p>
          <GenericForm
            schema={claimManualRefundInputSchema}
            fields={[]}
            defaultValues={{ expectedVersion: detail.version }}
            transform={commonTransform('claim')}
            submitLabel="Tôi sẽ chuyển tiền"
            serverError={serverError}
          />
        </ActionSection>
      ) : null}

      {permissions.prepare && detail.status === 'ready_for_transfer' && isMaker ? (
        <ActionSection icon={<FileCheck2 className="size-4" />} title="Ghi nhận giao dịch đã chuyển">
          <GenericForm
            schema={submitManualRefundTransferInputSchema}
            fields={[{ name: 'reference', type: 'text', label: 'Mã giao dịch ngân hàng', required: true, autoComplete: 'off' }]}
            defaultValues={{ expectedVersion: detail.version, reference: '', evidenceObjectKey: '' }}
            transform={commonTransform('submit-transfer')}
            submitLabel="Gửi checker xác nhận"
            submitPendingLabel="Đang khóa bằng chứng…"
            serverError={serverError}
            extraFields={(form) => (
              <ManualRefundEvidenceUpload
                operationId={detail.id}
                version={detail.version}
                value={form.watch('evidenceObjectKey')}
                onChange={(key) => form.setValue('evidenceObjectKey', key, { shouldValidate: true })}
              />
            )}
          />
        </ActionSection>
      ) : null}

      {permissions.prepare && detail.status === 'ready_for_transfer' && detail.makerUserId && makerOptions.length > 0 ? (
        <ActionSection icon={<UserRoundCheck className="size-4" />} title="Chuyển người phụ trách">
          <GenericForm
            schema={reassignManualRefundInputSchema}
            fields={[
              { name: 'makerUserId', type: 'select', label: 'Người phụ trách mới', required: true, options: makerOptions },
              { name: 'reason', type: 'textarea', rows: 2, label: 'Lý do bàn giao', required: true },
            ]}
            defaultValues={{ expectedVersion: detail.version, makerUserId: makerOptions[0]?.value ?? '', reason: '' }}
            transform={commonTransform('reassign')}
            submitLabel="Bàn giao batch"
            serverError={serverError}
          />
        </ActionSection>
      ) : null}

      {permissions.approve && detail.status === 'transfer_submitted' ? (
        <ActionSection icon={<ShieldCheck className="size-4" />} title="Checker độc lập">
          {isMaker ? (
            <p className="text-sm text-destructive">Bạn là maker của giao dịch này nên không thể tự duyệt.</p>
          ) : (
            <GenericForm
              schema={approveManualRefundInputSchema}
              fields={[{ name: 'note', type: 'textarea', rows: 2, label: 'Ghi chú kiểm tra' }]}
              defaultValues={{ expectedVersion: detail.version, note: '' }}
              transform={commonTransform('approve')}
              submitLabel="Duyệt và hoàn tất batch"
              submitPendingLabel="Đang hoàn tất…"
              serverError={serverError}
            />
          )}
          {!isMaker ? <Separator className="my-4" /> : null}
          {!isMaker ? (
            <GenericForm
              schema={rejectManualRefundInputSchema}
              fields={[{ name: 'reason', type: 'textarea', rows: 2, label: 'Lý do từ chối', required: true }]}
              defaultValues={{ expectedVersion: detail.version, reason: '' }}
              transform={commonTransform('reject')}
              submitLabel="Từ chối biên lai"
              serverError={serverError}
            />
          ) : null}
        </ActionSection>
      ) : null}

      {permissions.approve && ['correction_required', 'transfer_rejected'].includes(detail.status) ? (
        <ActionSection icon={<CircleAlert className="size-4" />} title="Mở lại thông tin nhận tiền">
          <GenericForm
            schema={rejectManualRefundInputSchema}
            fields={[{ name: 'reason', type: 'textarea', rows: 2, label: 'Lý do yêu cầu khách khai báo lại', required: true }]}
            defaultValues={{ expectedVersion: detail.version, reason: '' }}
            transform={commonTransform('reopen')}
            submitLabel="Mở lại cho khách"
            serverError={serverError}
          />
        </ActionSection>
      ) : null}

      {detail.status === 'awaiting_details' ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Đang chờ khách gửi tài khoản qua liên kết đăng nhập hoặc OTP. Timer 48 giờ chỉ nhắc và escalates, không tự huỷ khoản hoàn.</p>
      ) : null}
      {detail.status === 'completed' ? (
        <p className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-4 text-sm text-success"><CheckCircle2 className="size-4" /> Batch đã hoàn tất; booking và settlement sẽ được đồng bộ bởi consumer hiện tại.</p>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words font-medium">{value}</dd></div>;
}

function ActionSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border p-4"><h3 className="mb-3 flex items-center gap-2 font-semibold">{icon}{title}</h3>{children}</section>;
}
