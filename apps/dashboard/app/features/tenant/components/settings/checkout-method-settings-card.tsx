import type { FormEvent } from 'react';
import {
  GATEWAY_SUPPORTED_METHODS,
  type CustomerPaymentMethod,
  type GatewayConfigResponse,
  type GatewayKey,
  type PaymentMethodRoute,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Label } from '@booking/ui/components/ui/label';
import { CreditCard, TriangleAlert } from 'lucide-react';
import { Form, useNavigation, useSubmit } from 'react-router';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

const METHODS = [
  ['bank_transfer', 'Chuyển khoản ngân hàng', 'Chuyển khoản/VietQR theo provider đã chọn.'],
  ['international_card', 'Thẻ quốc tế', 'Visa, Mastercard và JCB khi merchant hỗ trợ.'],
  ['momo_wallet', 'Ví MoMo', 'Thanh toán bằng ví MoMo.'],
  ['zalopay_wallet', 'Ví ZaloPay', 'Thanh toán bằng ví ZaloPay.'],
] as const satisfies readonly (readonly [CustomerPaymentMethod, string, string])[];

const PROVIDER_LABELS: Record<GatewayKey, string> = {
  sepay: 'SePay',
  payos: 'PayOS',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  mock: 'Mock',
};

function providersFor(
  method: CustomerPaymentMethod,
  configs: GatewayConfigResponse[],
): GatewayKey[] {
  return configs
    .map((config) => config.gateway)
    .filter(
      (gateway): gateway is GatewayKey =>
        gateway !== 'mock' && GATEWAY_SUPPORTED_METHODS[gateway].includes(method),
    );
}

export function CheckoutMethodSettingsCard({
  routes,
  configs,
  readOnly,
  error,
  success,
}: {
  routes: PaymentMethodRoute[];
  configs: GatewayConfigResponse[];
  readOnly: boolean;
  error: string | null;
  success: boolean;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy: isSubmitting, run } = useSubmissionGuard(navigation.state);
  const routeByMethod = new Map(routes.map((route) => [route.method, route]));

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <Card className="shadow-none" aria-busy={isSubmitting}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4 text-primary" aria-hidden="true" /> Phương thức tại checkout
        </CardTitle>
        <CardDescription>
          Mỗi phương thức dùng đúng một provider. BookingOS không tự chuyển sang provider khác khi
          provider đã chọn lỗi hoặc mất kết nối.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="space-y-5" onSubmit={handleSubmit}>
          <input type="hidden" name="intent" value="payment-routing" />
          <ErrorBanner error={error} />
          <SuccessBanner message={success ? 'Đã lưu định tuyến thanh toán.' : null} />

          <fieldset disabled={readOnly || isSubmitting} className="space-y-3">
            <legend className="sr-only">Định tuyến phương thức thanh toán</legend>
            {METHODS.map(([method, label, description]) => {
              const current = routeByMethod.get(method);
              const connected = providersFor(method, configs);
              const selected = current?.gateway ?? connected[0] ?? null;
              const selectedConnected = selected !== null && connected.includes(selected);
              const choices = selected && !connected.includes(selected) ? [selected, ...connected] : connected;
              const canConfigure = choices.length > 0;

              return (
                <div key={method} className="rounded-xl border bg-muted/10 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <Label className="flex cursor-pointer items-start gap-3 font-normal">
                      <Checkbox
                        name="enabledMethods"
                        value={method}
                        defaultChecked={current?.enabled ?? false}
                        disabled={!canConfigure || readOnly || isSubmitting}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {description}
                        </span>
                      </span>
                    </Label>

                    <div className="w-full sm:w-56">
                      {choices.length === 1 && selected ? (
                        <>
                          <input type="hidden" name={`gateway:${method}`} value={selected} />
                          <div className="rounded-md border bg-background px-3 py-2 text-sm">
                            {PROVIDER_LABELS[selected]}
                          </div>
                        </>
                      ) : choices.length > 1 ? (
                        <select
                          name={`gateway:${method}`}
                          defaultValue={selected ?? ''}
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {choices.map((gateway) => (
                            <option key={gateway} value={gateway}>
                              {PROVIDER_LABELS[gateway]}
                              {!connected.includes(gateway) ? ' — đã ngắt kết nối' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          Chưa có provider hỗ trợ
                        </div>
                      )}
                    </div>
                  </div>

                  {current && !selectedConnected ? (
                    <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-warning">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      {PROVIDER_LABELS[current.gateway]} đang ngắt kết nối. Route được giữ nguyên,
                      nhưng phương thức này sẽ không xuất hiện công khai cho tới khi provider được
                      kết nối lại hoặc bạn chọn provider khác.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </fieldset>

          <p className="text-xs leading-5 text-muted-foreground">
            Có thể tắt toàn bộ phương thức để chủ động dừng thanh toán online.
          </p>
          <Button type="submit" size="control" disabled={readOnly || isSubmitting}>
            {isSubmitting ? 'Đang lưu...' : 'Lưu định tuyến checkout'}
          </Button>
        </Form>
      </CardContent>
    </Card>
  );
}
