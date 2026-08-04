import { momoGatewaySettingsFormSchema, type GatewayConfigResponse } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { momoGatewayFields } from './settings-fields';
import { GatewaySetupNotes } from './gateway-setup-notes';

export function MomoGatewayBody({
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
  const active = config?.gateway === 'momo';
  return (
    <div>
      {saved ? (
        <Alert className="mb-4 border-success/40 text-success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>Đã lưu cấu hình MoMo.</AlertDescription>
        </Alert>
      ) : null}
      {active ? (
        <Alert className="mb-4">
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            Đang hoạt động ở {config.environment === 'production' ? 'Production' : 'Sandbox'} ·{' '}
            {config.partnerCode ?? 'Partner đã cấu hình'}. Hoàn tiền huỷ đơn sẽ tự động về ví MoMo của
            khách.
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
          schema={momoGatewaySettingsFormSchema}
          fields={momoGatewayFields}
          columns={2}
          defaultValues={{
            environment: config?.environment ?? 'sandbox',
            partnerCode: active ? (config.partnerCode ?? '') : '',
            accessKey: '',
            secretKey: '',
          }}
          transform={(values) => ({
            gateway: 'momo',
            environment: values.environment,
            credentials: {
              partnerCode: values.partnerCode,
              accessKey: values.accessKey,
              secretKey: values.secretKey,
            },
          })}
          method="put"
          submitLabel="Lưu cấu hình MoMo"
          submitPendingLabel="Đang mã hoá & lưu…"
          serverError={error}
          fieldErrors={fieldErrors}
        />
      </fieldset>
      <GatewaySetupNotes
        title="Cấu hình IPN trên MoMo Business"
        steps={[
          'Mở MoMo Business → Cấu hình kết nối → IPN URL.',
          <>
            IPN URL: <span className="font-mono">/webhooks/momo</span> trên API public HTTPS.
          </>,
          'MoMo gửi POST JSON, xác thực bằng chữ ký HMAC-SHA256 (Access Key + Secret Key).',
          'Sandbox và Production dùng hai bộ Partner Code/Access Key/Secret Key riêng.',
        ]}
        footnote="Access Key và Secret Key được mã hoá trước khi lưu và không hiển thị lại. Thanh toán qua ví MoMo (redirect); hoàn tiền huỷ đơn được đẩy tự động về ví khách qua API MoMo."
      />
    </div>
  );
}
