import {
  acknowledgeManualRefundInputSchema,
  submitManualRefundDestinationInputSchema,
  type ManualRefundStatusResponse,
} from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Badge } from '@booking/ui/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Banknote, CheckCircle2, CircleAlert, LockKeyhole } from 'lucide-react';
import { formatVnd } from '~/lib/ui';

const BANKS = [
  ['VCB', 'Vietcombank'],
  ['TCB', 'Techcombank'],
  ['MB', 'MB Bank'],
  ['ACB', 'ACB'],
  ['VPB', 'VPBank'],
  ['BIDV', 'BIDV'],
  ['CTG', 'VietinBank'],
  ['TPB', 'TPBank'],
  ['STB', 'Sacombank'],
] as const;

const COPY = {
  vi: {
    title: 'Theo dõi hoàn tiền',
    intro: 'Tài khoản ngân hàng chỉ dùng cho khoản hoàn này và được che sau khi gửi.',
    amount: 'Số tiền hoàn',
    deadline: 'Hạn cung cấp thông tin',
    transferDeadline: 'Hạn chuyển tiền dự kiến',
    destination: 'Tài khoản nhận',
    submit: 'Gửi thông tin nhận tiền',
    update: 'Cập nhật lại tài khoản',
    bank: 'Ngân hàng',
    accountNumber: 'Số tài khoản',
    accountName: 'Tên chủ tài khoản',
    thirdParty: 'Tài khoản này không đứng tên người đặt',
    consent: 'Tôi xác nhận chủ tài khoản đồng ý nhận khoản hoàn này',
    thirdPartyHelp: 'Tài khoản khác tên cần xác nhận bằng mã OTP gửi tới email của booking.',
    locked: 'Thông tin đã được khóa vì finance đang xử lý chuyển khoản.',
    received: 'Tôi đã nhận tiền',
    notReceived: 'Tôi chưa nhận được tiền',
    note: 'Ghi chú (không bắt buộc)',
    success: 'Yêu cầu đã được ghi nhận.',
    failure: 'Không thể cập nhật. Vui lòng kiểm tra lại hoặc tải lại trang.',
    statuses: {
      awaiting_details: 'Cần cung cấp tài khoản',
      verification_required: 'Đang xác minh tài khoản',
      correction_required: 'Thông tin chưa khớp',
      ready_for_transfer: 'Sẵn sàng chuyển tiền',
      transfer_submitted: 'Đã chuyển, đang kiểm tra',
      transfer_rejected: 'Biên lai cần kiểm tra lại',
      completed: 'Đã hoàn tiền',
    },
  },
  en: {
    title: 'Refund tracking',
    intro: 'Your bank account is used only for this refund and is masked after submission.',
    amount: 'Refund amount',
    deadline: 'Details deadline',
    transferDeadline: 'Expected transfer deadline',
    destination: 'Destination account',
    submit: 'Submit refund details',
    update: 'Update destination account',
    bank: 'Bank',
    accountNumber: 'Account number',
    accountName: 'Account holder name',
    thirdParty: 'This account is not in the booker’s name',
    consent: 'I confirm the account holder consents to receive this refund',
    thirdPartyHelp: 'A third-party account requires the OTP sent to the booking email.',
    locked: 'The destination is locked while the finance team processes the transfer.',
    received: 'I received the money',
    notReceived: 'I have not received it',
    note: 'Note (optional)',
    success: 'Your response was recorded.',
    failure: 'We could not update this refund. Check the details or reload the page.',
    statuses: {
      awaiting_details: 'Bank details required',
      verification_required: 'Account verification in progress',
      correction_required: 'Details do not match',
      ready_for_transfer: 'Ready for transfer',
      transfer_submitted: 'Transferred, under review',
      transfer_rejected: 'Receipt needs review',
      completed: 'Refund completed',
    },
  },
} as const;

export interface CustomerRefundActionData {
  ok: boolean;
  error?: string | null;
  operationId?: string;
}

export function ManualRefundCustomerPanel({
  refunds,
  locale,
  actionData,
}: {
  refunds: ManualRefundStatusResponse[];
  locale: Locale;
  actionData?: CustomerRefundActionData;
}) {
  if (refunds.length === 0) return null;
  const copy = COPY[locale];
  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6"
      aria-labelledby="manual-refund-heading"
    >
      <div className="mb-4">
        <h2
          id="manual-refund-heading"
          className="flex items-center gap-2 text-xl font-bold text-foreground"
        >
          <Banknote className="size-5 text-primary" /> {copy.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.intro}</p>
      </div>
      <div className="grid gap-4">
        {refunds.map((refund) => (
          <RefundCard
            key={refund.id}
            refund={refund}
            locale={locale}
            actionData={actionData?.operationId === refund.id ? actionData : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function RefundCard({
  refund,
  locale,
  actionData,
}: {
  refund: ManualRefundStatusResponse;
  locale: Locale;
  actionData?: CustomerRefundActionData;
}) {
  const copy = COPY[locale];
  const editable =
    !refund.destinationLocked &&
    [
      'awaiting_details',
      'verification_required',
      'correction_required',
      'ready_for_transfer',
    ].includes(refund.status);
  const danger = refund.status === 'correction_required' || refund.status === 'transfer_rejected';
  return (
    <Card className={danger ? 'border-destructive/40' : undefined}>
      <CardHeader className="border-b bg-muted/25">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{copy.statuses[refund.status]}</CardTitle>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{refund.bookingCode}</p>
          </div>
          <Badge
            variant="outline"
            className={
              danger ? 'border-destructive/30 text-destructive' : 'border-primary/30 text-primary'
            }
          >
            {formatVnd(refund.amount) ?? refund.amount}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Fact label={copy.amount} value={formatVnd(refund.amount) ?? refund.amount} />
          <Fact
            label={refund.customerDetailsDueAt ? copy.deadline : copy.transferDeadline}
            value={formatDeadline(refund.customerDetailsDueAt ?? refund.transferDueAt, locale)}
          />
          <Fact
            label={copy.destination}
            value={
              refund.destination
                ? `${refund.destination.bankCode} · •••• ${refund.destination.accountNumberLast4}`
                : '—'
            }
          />
        </dl>

        {danger ? (
          <p
            className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {copy.statuses[refund.status]}
          </p>
        ) : null}
        {refund.destinationLocked ? (
          <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-4 shrink-0" /> {copy.locked}
          </p>
        ) : null}
        {actionData ? (
          <p
            className={`flex items-center gap-2 text-sm ${actionData.ok ? 'text-success' : 'text-destructive'}`}
            role={actionData.ok ? 'status' : 'alert'}
          >
            {actionData.ok ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <CircleAlert className="size-4" />
            )}
            {actionData.ok ? copy.success : copy.failure}
          </p>
        ) : null}

        {editable ? (
          <GenericForm
            schema={submitManualRefundDestinationInputSchema}
            columns={2}
            fields={[
              {
                name: 'bankCode',
                type: 'select',
                label: copy.bank,
                required: true,
                options: BANKS.map(([value, label]) => ({ value, label })),
              },
              {
                name: 'accountNumber',
                type: 'text',
                label: copy.accountNumber,
                required: true,
                autoComplete: 'off',
              },
              {
                name: 'accountName',
                type: 'text',
                label: copy.accountName,
                required: true,
                autoComplete: 'name',
                colSpan: 2,
              },
              { name: 'isThirdParty', type: 'checkbox', label: copy.thirdParty, colSpan: 2 },
              {
                name: 'thirdPartyConsent',
                type: 'checkbox',
                label: copy.consent,
                description: copy.thirdPartyHelp,
                colSpan: 2,
                hidden: (values) => !values.isThirdParty,
              },
            ]}
            defaultValues={{
              bankCode: refund.destination?.bankCode ?? 'VCB',
              accountNumber: '',
              accountName: '',
              isThirdParty: refund.destination?.isThirdParty ?? false,
              thirdPartyConsent: false,
              expectedVersion: refund.version,
            }}
            transform={(values) => ({
              ...values,
              intent: 'submit-refund-destination',
              operationId: refund.id,
            })}
            submitLabel={refund.destination ? copy.update : copy.submit}
            submitPendingLabel={locale === 'vi' ? 'Đang xác minh…' : 'Verifying…'}
            serverError={actionData && !actionData.ok ? copy.failure : null}
          />
        ) : null}

        {refund.status === 'completed' ? (
          <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <AcknowledgementForm refund={refund} locale={locale} acknowledgement="received" />
            <AcknowledgementForm refund={refund} locale={locale} acknowledgement="not_received" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AcknowledgementForm({
  refund,
  locale,
  acknowledgement,
}: {
  refund: ManualRefundStatusResponse;
  locale: Locale;
  acknowledgement: 'received' | 'not_received';
}) {
  const copy = COPY[locale];
  return (
    <GenericForm
      schema={acknowledgeManualRefundInputSchema}
      fields={[{ name: 'note', type: 'textarea', rows: 2, label: copy.note }]}
      defaultValues={{ acknowledgement, note: '', expectedVersion: refund.version }}
      transform={(values) => ({ ...values, intent: 'acknowledge-refund', operationId: refund.id })}
      submitLabel={acknowledgement === 'received' ? copy.received : copy.notReceived}
      submitPendingLabel={locale === 'vi' ? 'Đang ghi nhận…' : 'Saving…'}
    />
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function formatDeadline(value: string | null, locale: Locale): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}
