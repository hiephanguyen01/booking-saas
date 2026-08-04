import { zalopayGatewaySettingsFormSchema, type GatewayConfigResponse } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { zalopayGatewayFields } from './settings-fields';
import { GatewaySetupNotes } from './gateway-setup-notes';

export function ZalopayGatewayBody({
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
  const active = config?.gateway === 'zalopay';
  return (
    <div>
      {saved ? (
        <Alert className="mb-4 border-success/40 text-success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>Đã lưu cấu hình ZaloPay.</AlertDescription>
        </Alert>
      ) : null}
      {active ? (
        <Alert className="mb-4">
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            Đang hoạt động ở {config.environment === 'production' ? 'Production' : 'Sandbox'} · App
            ID {config.appId ?? 'đã cấu hình'}. Hoàn tiền huỷ đơn tự động về ví ZaloPay của khách.
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
          schema={zalopayGatewaySettingsFormSchema}
          fields={zalopayGatewayFields}
          columns={2}
          defaultValues={{
            environment: config?.environment ?? 'sandbox',
            appId: active ? (config.appId ?? '') : '',
            key1: '',
            key2: '',
          }}
          transform={(values) => ({
            gateway: 'zalopay',
            environment: values.environment,
            credentials: {
              appId: values.appId,
              key1: values.key1,
              key2: values.key2,
            },
          })}
          method="put"
          submitLabel="Lưu cấu hình ZaloPay"
          submitPendingLabel="Đang mã hoá & lưu…"
          serverError={error}
          fieldErrors={fieldErrors}
        />
      </fieldset>
      <GatewaySetupNotes
        title="Cấu hình callback trên ZaloPay Merchant"
        steps={[
          'Mở merchant.zalopay.vn → Ứng dụng → Cấu hình Callback URL.',
          <>
            Callback URL: <span className="font-mono">/webhooks/zalopay</span> trên API public HTTPS.
          </>,
          'ZaloPay gửi POST JSON, xác thực bằng chữ ký HMAC-SHA256 (Key1 tạo đơn, Key2 callback).',
          'Sandbox và Production dùng hai bộ App ID/Key1/Key2 riêng.',
        ]}
        footnote="Key1 và Key2 được mã hoá trước khi lưu và không hiển thị lại. Thanh toán qua ví ZaloPay (redirect); hoàn tiền huỷ đơn được đẩy tự động về ví khách qua API ZaloPay."
      />
    </div>
  );
}
