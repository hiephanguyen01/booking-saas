import { sepayGatewaySettingsFormSchema, type GatewayConfigResponse } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { CheckCircle2, CircleAlert, ShieldCheck } from 'lucide-react';
import { sepayGatewayFields } from './settings-fields';

export function SepayGatewayCard({
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
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Cổng thanh toán SePay</CardTitle>
            <CardDescription className="mt-1.5">
              Nhận chuyển khoản VietQR trên storefront bằng tài khoản merchant của tenant.
            </CardDescription>
          </div>
          <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        {saved ? (
          <Alert className="mb-4 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" />
            <AlertDescription>Đã lưu cấu hình SePay.</AlertDescription>
          </Alert>
        ) : null}
        {config?.gateway === 'sepay' ? (
          <Alert className="mb-4">
            <CheckCircle2 className="size-4" />
            <AlertDescription>
              Đang hoạt động ở {config.environment === 'production' ? 'Production' : 'Sandbox'} ·{' '}
              {config.merchantId ?? 'Merchant đã cấu hình'}.
            </AlertDescription>
          </Alert>
        ) : null}
        {readOnly ? (
          <Alert className="mb-4 border-warning/40 bg-warning/10 text-warning-foreground [&>svg]:text-warning">
            <CircleAlert className="size-4" />
            <AlertDescription>
              Chế độ chỉ đọc — không thể thay đổi cổng thanh toán.
            </AlertDescription>
          </Alert>
        ) : null}
        <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-60">
          <GenericForm
            schema={sepayGatewaySettingsFormSchema}
            fields={sepayGatewayFields}
            columns={2}
            defaultValues={{
              environment: config?.environment ?? 'sandbox',
              merchantId: config?.gateway === 'sepay' ? (config.merchantId ?? '') : '',
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
        <div className="mt-4 rounded-lg border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">Cấu hình IPN trên SePay</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Mở Cổng thanh toán → Cấu hình → IPN trong merchant SePay.</li>
            <li>
              IPN URL: <span className="font-mono">/webhooks/sepay</span> trên API public HTTPS.
            </li>
            <li>SePay gửi POST JSON và xác thực bằng Merchant Secret Key qua X-Secret-Key.</li>
            <li>Sandbox và Production dùng hai bộ Merchant ID/Secret Key riêng.</li>
          </ol>
          <p className="mt-2">
            Merchant Secret Key được mã hoá trước khi lưu và không được hiển thị lại. Không cấu hình
            endpoint này trong mục Webhooks biến động số dư.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
