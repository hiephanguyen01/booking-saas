import type { CheckoutDestination } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { useEffect, useRef } from 'react';
import { NsI18n, useTranslation } from '../../../lib/i18n';

type FormPostDestination = Extract<CheckoutDestination, { type: 'form_post' }>;

/** Browser handoff required by SePay: submit the server-signed fields directly
 * to the gateway. No merchant credential is present in this payload. */
export function PaymentHandoff({ destination }: { destination: FormPostDestination }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { t } = useTranslation(NsI18n.Checkout);

  useEffect(() => {
    formRef.current?.submit();
  }, []);

  return (
    <main className="grid min-h-[60vh] place-items-center bg-muted px-4 py-12">
      <Card className="w-full max-w-md rounded-sm">
        <CardContent className="flex flex-col items-center p-8 text-center">
          <Spinner className="size-7 text-primary" />
          <h1 className="mt-5 text-xl font-semibold text-foreground">
            {t('payment.handoffTitle')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('payment.handoffDescription')}
          </p>
          <form ref={formRef} action={destination.actionUrl} method="post" className="mt-6 w-full">
            {Object.entries(destination.fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <Button type="submit" className="w-full rounded-sm">
              {t('payment.handoffContinue')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
