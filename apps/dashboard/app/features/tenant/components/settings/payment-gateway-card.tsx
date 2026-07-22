import { useState } from 'react';
import { Form, useNavigation } from 'react-router';
import type { GatewayConfigResponse } from '@booking/contracts';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { CircleAlert, PowerOff, WalletCards } from 'lucide-react';
import { SepayGatewayBody } from './sepay-gateway-card';
import { MomoGatewayBody } from './momo-gateway-card';

type Choice = 'sepay' | 'momo' | 'off';

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'sepay', label: 'SePay' },
  { value: 'momo', label: 'MoMo' },
  { value: 'off', label: 'Tắt' },
];

export function PaymentGatewayCard({
  config,
  readOnly,
  sepaySaved,
  sepayError,
  sepayFieldErrors,
  momoSaved,
  momoError,
  momoFieldErrors,
  offError,
}: {
  config: GatewayConfigResponse | null;
  readOnly: boolean;
  sepaySaved: boolean;
  sepayError: string | null;
  sepayFieldErrors: Record<string, string[]> | null;
  momoSaved: boolean;
  momoError: string | null;
  momoFieldErrors: Record<string, string[]> | null;
  offError: string | null;
}) {
  const activeGateway: Choice =
    config?.gateway === 'momo' ? 'momo' : config?.gateway === 'sepay' ? 'sepay' : 'off';
  const [selected, setSelected] = useState<Choice>(activeGateway);
  const nav = useNavigation();
  const disabling =
    nav.state !== 'idle' && nav.formData?.get('intent') === 'disable-gateway';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Cổng thanh toán</CardTitle>
            <CardDescription className="mt-1.5">
              Chọn một cổng để nhận thanh toán trên storefront. Mỗi lúc chỉ một cổng hoạt động.
            </CardDescription>
          </div>
          <WalletCards className="size-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        <div
          role="tablist"
          aria-label="Cổng thanh toán"
          className="mb-5 inline-flex rounded-lg border bg-muted/40 p-1"
        >
          {CHOICES.map((c) => {
            const isActive = selected === c.value;
            const isLive = activeGateway === c.value && c.value !== 'off';
            return (
              <button
                key={c.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelected(c.value)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {c.label}
                {isLive ? <span className="ml-1.5 text-emerald-500">●</span> : null}
              </button>
            );
          })}
        </div>

        {selected === 'sepay' ? (
          <SepayGatewayBody
            config={config}
            readOnly={readOnly}
            saved={sepaySaved}
            error={sepayError}
            fieldErrors={sepayFieldErrors}
          />
        ) : null}

        {selected === 'momo' ? (
          <MomoGatewayBody
            config={config}
            readOnly={readOnly}
            saved={momoSaved}
            error={momoError}
            fieldErrors={momoFieldErrors}
          />
        ) : null}

        {selected === 'off' ? (
          <div>
            {offError ? (
              <Alert className="mb-4 border-destructive/40 text-destructive [&>svg]:text-destructive">
                <CircleAlert className="size-4" />
                <AlertDescription>{offError}</AlertDescription>
              </Alert>
            ) : null}
            {activeGateway === 'off' ? (
              <Alert className="mb-4">
                <PowerOff className="size-4" />
                <AlertDescription>
                  Chưa bật cổng thanh toán nào. Khách chưa thể thanh toán trên storefront.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  Đang bật <span className="font-medium text-foreground">{config?.gateway}</span>.
                  Tắt sẽ ngừng nhận thanh toán mới trên storefront (không ảnh hưởng đơn đã thanh
                  toán).
                </p>
                <Form method="post">
                  <input type="hidden" name="intent" value="disable-gateway" />
                  <Button type="submit" variant="destructive" disabled={readOnly || disabling}>
                    {disabling ? 'Đang tắt…' : 'Tắt cổng thanh toán'}
                  </Button>
                </Form>
              </>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
