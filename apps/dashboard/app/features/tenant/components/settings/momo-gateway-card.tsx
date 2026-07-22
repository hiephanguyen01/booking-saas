import { momoGatewaySettingsFormSchema, type GatewayConfigResponse } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { CheckCircle2, CircleAlert, Wallet } from 'lucide-react';
import { momoGatewayFields } from './settings-fields';

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
        <Alert className="mb-4 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
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
      <div className="mt-4 rounded-lg border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <Wallet className="size-3.5" aria-hidden="true" /> Cấu hình IPN trên MoMo Business
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Mở MoMo Business → Cấu hình kết nối → IPN URL.</li>
          <li>
            IPN URL: <span className="font-mono">/webhooks/momo</span> trên API public HTTPS.
          </li>
          <li>MoMo gửi POST JSON, xác thực bằng chữ ký HMAC-SHA256 (Access Key + Secret Key).</li>
          <li>Sandbox và Production dùng hai bộ Partner Code/Access Key/Secret Key riêng.</li>
        </ol>
        <p className="mt-2">
          Access Key và Secret Key được mã hoá trước khi lưu và không hiển thị lại. Thanh toán qua ví
          MoMo (redirect); hoàn tiền huỷ đơn được đẩy tự động về ví khách qua API MoMo.
        </p>
      </div>
    </div>
  );
}
