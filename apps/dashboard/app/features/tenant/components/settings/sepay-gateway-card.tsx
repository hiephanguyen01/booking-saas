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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import { Button } from '@booking/ui/components/ui/button';
import { CheckCircle2, ChevronDown, CircleAlert, ShieldCheck } from 'lucide-react';
import { sepayGatewayFields } from './settings-fields';

export function SepayGatewayCard({
  config,
  readOnly,
  saved,
  error,
  fieldErrors,
  loadError,
}: {
  config: GatewayConfigResponse | null;
  readOnly: boolean;
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]> | null;
  loadError: string | null;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Cổng thanh toán SePay</CardTitle>
            <CardDescription className="mt-1.5">
              Kết nối tài khoản merchant để nhận thanh toán VietQR trực tiếp trên storefront.
            </CardDescription>
          </div>
          <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <Alert variant="destructive" className="mb-4">
            <CircleAlert className="size-4" />
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}
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
              Đã kết nối ở môi trường{' '}
              {config.environment === 'production' ? 'Production' : 'Sandbox'}. Merchant ID:{' '}
              {config.merchantId ?? 'đã cấu hình'}.
            </AlertDescription>
          </Alert>
        ) : null}
        {readOnly ? (
          <Alert className="mb-4 border-warning/40 bg-warning/10 text-warning-foreground [&>svg]:text-warning">
            <CircleAlert className="size-4" />
            <AlertDescription>Chế độ chỉ đọc. Không thể thay đổi cổng thanh toán.</AlertDescription>
          </Alert>
        ) : null}
        <fieldset disabled={readOnly || Boolean(loadError)} className="min-w-0 disabled:opacity-60">
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
        <Collapsible className="group mt-5 rounded-xl border bg-muted/20">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between px-4 py-3 text-sm"
            >
              Hướng dẫn cấu hình IPN
              <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t px-4 pb-4 pt-3 text-xs leading-5 text-muted-foreground">
            <ol className="list-decimal space-y-1 pl-4">
              <li>Mở Cổng thanh toán, chọn Cấu hình, sau đó chọn IPN trong merchant SePay.</li>
              <li>
                Đặt IPN URL thành <span className="font-mono">/webhooks/sepay</span> trên API public
                HTTPS.
              </li>
              <li>SePay gửi POST JSON và xác thực bằng Merchant Secret Key qua X-Secret-Key.</li>
              <li>Sandbox và Production dùng hai bộ Merchant ID và Secret Key riêng.</li>
            </ol>
            <p className="mt-2">
              Secret Key được mã hoá trước khi lưu và không hiển thị lại. Khi thay đổi cấu hình, hãy
              nhập lại key để xác nhận bộ thông tin mới.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
