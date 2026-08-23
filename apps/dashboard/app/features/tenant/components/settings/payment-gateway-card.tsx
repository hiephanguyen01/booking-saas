import type { FormEvent, ReactNode } from 'react';
import { Form, useNavigation, useSubmit } from 'react-router';
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
import { CircleAlert, WalletCards } from 'lucide-react';
import { SepayGatewayBody } from './sepay-gateway-card';
import { PayosGatewayBody } from './payos-gateway-card';
import { MomoGatewayBody } from './momo-gateway-card';
import { ZalopayGatewayBody } from './zalopay-gateway-card';
import { WalletGatewayPanel } from './wallet-gateway-panel';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

interface Feedback {
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]> | null;
}

export function PaymentGatewayCard({
  configs,
  readOnly,
  sepay,
  payos,
  momo,
  zalopay,
  offError,
}: {
  configs: GatewayConfigResponse[];
  readOnly: boolean;
  sepay: Feedback;
  payos: Feedback;
  momo: Feedback;
  zalopay: Feedback;
  offError: string | null;
}) {
  const byGateway = (gateway: GatewayKey) => configs.find((config) => config.gateway === gateway) ?? null;
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy, run } = useSubmissionGuard(navigation.state);
  const disablingGateway =
    navigation.state !== 'idle' && navigation.formData?.get('intent') === 'disable-gateway'
      ? String(navigation.formData.get('gateway') ?? '')
      : null;

  const handleDisable = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  const provider = (
    gateway: Exclude<GatewayKey, 'mock'>,
    label: string,
    feedback: Feedback,
    body: ReactNode,
  ) => {
    const config = byGateway(gateway);
    return (
      <WalletGatewayPanel
        label={label}
        enabled={Boolean(config)}
        forceOpen={Boolean(feedback.error) || feedback.saved}
      >
        {body}
        {config ? (
          <Form method="post" className="mt-3" onSubmit={handleDisable}>
            <input type="hidden" name="intent" value="disable-gateway" />
            <input type="hidden" name="gateway" value={gateway} />
            <Button type="submit" variant="outline" size="sm" disabled={readOnly || busy}>
              {disablingGateway === gateway ? 'Đang tắt…' : `Ngắt kết nối ${label}`}
            </Button>
          </Form>
        ) : null}
      </WalletGatewayPanel>
    );
  };

  return (
    <Card aria-busy={busy}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Payment Providers</CardTitle>
            <CardDescription className="mt-1.5">
              Kết nối SePay, PayOS, MoMo và ZaloPay độc lập. Việc kết nối provider không tự quyết định
              phương thức nào xuất hiện tại checkout.
            </CardDescription>
          </div>
          <WalletCards className="size-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {offError ? (
          <Alert className="border-destructive/40 text-destructive [&>svg]:text-destructive">
            <CircleAlert className="size-4" />
            <AlertDescription>{offError}</AlertDescription>
          </Alert>
        ) : null}

        <fieldset disabled={busy} className="grid gap-4 lg:grid-cols-2">
          {provider(
            'sepay',
            'SePay',
            sepay,
            <SepayGatewayBody
              config={byGateway('sepay')}
              readOnly={readOnly}
              saved={sepay.saved}
              error={sepay.error}
              fieldErrors={sepay.fieldErrors}
            />,
          )}
          {provider(
            'payos',
            'PayOS',
            payos,
            <PayosGatewayBody
              config={byGateway('payos')}
              readOnly={readOnly}
              saved={payos.saved}
              error={payos.error}
              fieldErrors={payos.fieldErrors}
            />,
          )}
          {provider(
            'momo',
            'MoMo',
            momo,
            <MomoGatewayBody
              config={byGateway('momo')}
              readOnly={readOnly}
              saved={momo.saved}
              error={momo.error}
              fieldErrors={momo.fieldErrors}
            />,
          )}
          {provider(
            'zalopay',
            'ZaloPay',
            zalopay,
            <ZalopayGatewayBody
              config={byGateway('zalopay')}
              readOnly={readOnly}
              saved={zalopay.saved}
              error={zalopay.error}
              fieldErrors={zalopay.fieldErrors}
            />,
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}
