import {
  payosGatewaySettingsFormSchema,
  type GatewayConfigResponse,
  type PayosGatewaySettingsForm,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { GatewaySetupNotes } from './gateway-setup-notes';

const payosGatewayFields: FieldConfig<PayosGatewaySettingsForm>[] = [
  {
    name: 'environment',
    type: 'radio',
    label: 'Môi trường',
    variant: 'segmented',
    options: [
      { label: 'Sandbox', value: 'sandbox' },
      { label: 'Production', value: 'production' },
    ],
    colSpan: 2,
  },
  {
    name: 'clientId',
    type: 'text',
    label: 'Client ID',
    placeholder: 'Client ID từ PayOS',
    required: true,
  },
  {
    name: 'apiKey',
    type: 'password',
    label: 'API Key',
    placeholder: 'Nhập API Key',
    autoComplete: 'new-password',
    required: true,
  },
  {
    name: 'checksumKey',
    type: 'password',
    label: 'Checksum Key',
    description: 'Dùng để ký request và xác thực webhook PayOS.',
    placeholder: 'Nhập Checksum Key',
    autoComplete: 'new-password',
    required: true,
    colSpan: 2,
  },
];

export function PayosGatewayBody({
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
  const active = config?.gateway === 'payos';
  return (
    <div>
      {saved ? (
        <Alert className="mb-4 border-success/40 text-success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>Đã lưu cấu hình PayOS.</AlertDescription>
        </Alert>
      ) : null}
      {active ? (
        <Alert className="mb-4">
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            Đang hoạt động ở {config.environment === 'production' ? 'Production' : 'Sandbox'}.
          </AlertDescription>
        </Alert>
      ) : null}
      {readOnly ? (
        <Alert className="mb-4 border-warning/40 bg-warning/10 text-warning-foreground [&>svg]:text-warning">
          <CircleAlert className="size-4" />
          <AlertDescription>Chế độ chỉ đọc — không thể thay đổi provider.</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-60">
        <GenericForm
          schema={payosGatewaySettingsFormSchema}
          fields={payosGatewayFields}
          columns={2}
          defaultValues={{
            environment: config?.environment ?? 'sandbox',
            clientId: '',
            apiKey: '',
            checksumKey: '',
          }}
          transform={(values) => ({
            gateway: 'payos',
            environment: values.environment,
            credentials: {
              clientId: values.clientId,
              apiKey: values.apiKey,
              checksumKey: values.checksumKey,
            },
          })}
          method="put"
          submitLabel="Lưu cấu hình PayOS"
          submitPendingLabel="Đang mã hoá & lưu…"
          serverError={error}
          fieldErrors={fieldErrors}
        />
      </fieldset>
      <GatewaySetupNotes
        title="Cấu hình webhook PayOS"
        steps={[
          'Mở kênh thanh toán PayOS và lấy Client ID, API Key, Checksum Key.',
          <>
            Webhook URL: <span className="font-mono">/webhooks/payos</span> trên API public HTTPS.
          </>,
          'Dùng đúng bộ khoá tương ứng với Sandbox hoặc Production.',
        ]}
        footnote="API Key và Checksum Key được mã hoá trước khi lưu và không được hiển thị lại."
      />
    </div>
  );
}
