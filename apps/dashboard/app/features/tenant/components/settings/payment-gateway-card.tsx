import { Form, useNavigation } from 'react-router';
import type { GatewayConfigResponse, GatewayKey } from '@booking/contracts';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Separator } from '@booking/ui/components/ui/separator';
import { CircleAlert, PowerOff, WalletCards } from 'lucide-react';
import { SepayGatewayBody } from './sepay-gateway-card';
import { MomoGatewayBody } from './momo-gateway-card';
import { ZalopayGatewayBody } from './zalopay-gateway-card';

const BASE_GATEWAYS: readonly GatewayKey[] = ['sepay', 'payos', 'mock'];

export function PaymentGatewayCard({
  configs,
  readOnly,
  sepaySaved,
  sepayError,
  sepayFieldErrors,
  momoSaved,
  momoError,
  momoFieldErrors,
  zalopaySaved,
  zalopayError,
  zalopayFieldErrors,
  offError,
}: {
  configs: GatewayConfigResponse[];
  readOnly: boolean;
  sepaySaved: boolean;
  sepayError: string | null;
  sepayFieldErrors: Record<string, string[]> | null;
  momoSaved: boolean;
  momoError: string | null;
  momoFieldErrors: Record<string, string[]> | null;
  zalopaySaved: boolean;
  zalopayError: string | null;
  zalopayFieldErrors: Record<string, string[]> | null;
  offError: string | null;
}) {
  const base = configs.find((c) => BASE_GATEWAYS.includes(c.gateway)) ?? null;
  const momoConfig = configs.find((c) => c.gateway === 'momo') ?? null;
  const zalopayConfig = configs.find((c) => c.gateway === 'zalopay') ?? null;

  const nav = useNavigation();
  const disablingGateway =
    nav.state !== 'idle' && nav.formData?.get('intent') === 'disable-gateway'
      ? String(nav.formData.get('gateway') ?? '')
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Cổng thanh toán</CardTitle>
            <CardDescription className="mt-1.5">
              Bật một cổng cơ bản để nhận chuyển khoản/thẻ, và bật song song các ví điện tử khách
              hàng hay dùng.
            </CardDescription>
          </div>
          <WalletCards className="size-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {offError ? (
          <Alert className="border-destructive/40 text-destructive [&>svg]:text-destructive">
            <CircleAlert className="size-4" />
            <AlertDescription>{offError}</AlertDescription>
          </Alert>
        ) : null}

        <section>
          <h3 className="mb-1 text-sm font-semibold">Cổng cơ bản</h3>
          <p className="mb-4 text-xs leading-5 text-muted-foreground">
            Chuyển khoản ngân hàng, Napas QR và thẻ nội địa/quốc tế.
          </p>
          {!base ? (
            <Alert className="mb-4">
              <PowerOff className="size-4" />
              <AlertDescription>
                Chưa bật cổng cơ bản. Khách chưa thể thanh toán chuyển khoản hoặc thẻ trên storefront.
              </AlertDescription>
            </Alert>
          ) : null}
          <SepayGatewayBody
            config={base}
            readOnly={readOnly}
            saved={sepaySaved}
            error={sepayError}
            fieldErrors={sepayFieldErrors}
          />
          {base?.gateway === 'sepay' ? (
            <Form method="post" className="mt-3">
              <input type="hidden" name="intent" value="disable-gateway" />
              <input type="hidden" name="gateway" value="sepay" />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={readOnly || disablingGateway === 'sepay'}
              >
                {disablingGateway === 'sepay' ? 'Đang tắt…' : 'Tắt cổng cơ bản'}
              </Button>
            </Form>
          ) : null}
        </section>

        <Separator />

        <section>
          <h3 className="mb-1 text-sm font-semibold">Ví điện tử (song song)</h3>
          <p className="mb-4 text-xs leading-5 text-muted-foreground">
            Có thể bật cùng lúc nhiều ví — mỗi ví hoạt động độc lập, không ảnh hưởng đến cổng cơ bản
            hay ví còn lại.
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
              <WalletStatusLine enabled={Boolean(momoConfig)} label="MoMo" />
              <MomoGatewayBody
                config={momoConfig}
                readOnly={readOnly}
                saved={momoSaved}
                error={momoError}
                fieldErrors={momoFieldErrors}
              />
              {momoConfig ? (
                <Form method="post" className="mt-3">
                  <input type="hidden" name="intent" value="disable-gateway" />
                  <input type="hidden" name="gateway" value="momo" />
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    disabled={readOnly || disablingGateway === 'momo'}
                  >
                    {disablingGateway === 'momo' ? 'Đang tắt…' : 'Tắt ví MoMo'}
                  </Button>
                </Form>
              ) : null}
            </div>

            <div className="rounded-xl border p-4">
              <WalletStatusLine enabled={Boolean(zalopayConfig)} label="ZaloPay" />
              <ZalopayGatewayBody
                config={zalopayConfig}
                readOnly={readOnly}
                saved={zalopaySaved}
                error={zalopayError}
                fieldErrors={zalopayFieldErrors}
              />
              {zalopayConfig ? (
                <Form method="post" className="mt-3">
                  <input type="hidden" name="intent" value="disable-gateway" />
                  <input type="hidden" name="gateway" value="zalopay" />
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    disabled={readOnly || disablingGateway === 'zalopay'}
                  >
                    {disablingGateway === 'zalopay' ? 'Đang tắt…' : 'Tắt ví ZaloPay'}
                  </Button>
                </Form>
              ) : null}
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function WalletStatusLine({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 text-sm font-medium">
      {enabled ? (
        <>
          <span className="text-emerald-500">●</span> Đang bật {label}
        </>
      ) : (
        <span className="text-muted-foreground">Chưa bật {label}</span>
      )}
    </p>
  );
}
