import { sepayGatewaySettingsFormSchema, type GatewayConfigResponse } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { sepayGatewayFields } from './settings-fields';
import { GatewaySetupNotes } from './gateway-setup-notes';

export function SepayGatewayBody({
  config,
  readOnly,
  saved,
  error,
  fieldErrors,
}: {
  config: GatewayConfigResponse | null;
  readOnly: boolean;
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]> | null;
}) {
  const active = config?.gateway === 'sepay';
  return (
    <div>
      {saved ? (
        <Alert className="mb-4 border-success/40 text-success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>Đã lưu cấu hình SePay.</AlertDescription>
        </Alert>
      ) : null}
      {active ? (
        <Alert className="mb-4">
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            Đang hoạt động ở {config.environment === 'production' ? 'Production' : 'Sandbox'} ·{' '}
            {config.merchantId ?? 'Merchant đã cấu hình'}. Hoàn tiền huỷ đơn cần chuyển khoản tay rồi
            xác nhận ở mục Giao dịch.
          </AlertDescription>
        </Alert>
      ) : null}
      {readOnly ? (
        <Alert className="mb-4 border-warning/40 bg-warning/10 text-warning-foreground [&>svg]:text-warning">
          <CircleAlert className="size-4" />
          <AlertDescription>Chế độ chỉ đọc — không thể thay đổi cổng thanh toán.</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-60">
        <GenericForm
          schema={sepayGatewaySettingsFormSchema}
          fields={sepayGatewayFields}
          columns={2}
          defaultValues={{
            environment: config?.environment ?? 'sandbox',
            merchantId: active ? (config.merchantId ?? '') : '',
            secretKey: '',
          }}
          transform={(values) => ({
            gateway: 'sepay',
            environment: values.environment,
            credentials: {
              merchantId: values.merchantId,
              secretKey: values.secretKey,
            },
          })}
          method="put"
          submitLabel="Lưu cấu hình SePay"
          submitPendingLabel="Đang mã hoá & lưu…"
          serverError={error}
          fieldErrors={fieldErrors}
        />
      </fieldset>
      <GatewaySetupNotes
        title="Cấu hình IPN trên SePay"
        steps={[
          'Mở Cổng thanh toán → Cấu hình → IPN trong merchant SePay.',
          <>
            IPN URL: <span className="font-mono">/webhooks/sepay</span> trên API public HTTPS.
          </>,
          'SePay gửi POST JSON và xác thực bằng Merchant Secret Key qua X-Secret-Key.',
          'Sandbox và Production dùng hai bộ Merchant ID/Secret Key riêng.',
        ]}
        footnote="Merchant Secret Key được mã hoá trước khi lưu và không được hiển thị lại. Không cấu hình endpoint này trong mục Webhooks biến động số dư."
      />
    </div>
  );
}
