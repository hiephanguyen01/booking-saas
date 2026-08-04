import type { CheckoutDestination } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { useEffect, useRef, type FormEvent } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { useSubmissionGuard } from '@booking/ui/hooks/use-submission-guard';

type FormPostDestination = Extract<CheckoutDestination, { type: 'form_post' }>;

/** Browser handoff for form-post gateways: submit server-signed fields directly
 * to the gateway. No merchant credential is present in this payload. */
export function PaymentHandoff({ destination }: { destination: FormPostDestination }) {
  const formRef = useRef<HTMLFormElement>(null);
  const hasAutoSubmittedRef = useRef(false);
  const { busy: submitting, run } = useSubmissionGuard('idle');
  const { t } = useTranslation(NsI18n.Checkout);

  useEffect(() => {
    const form = formRef.current;
    if (!form || hasAutoSubmittedRef.current) {
      return;
    }

    hasAutoSubmittedRef.current = true;
    form.requestSubmit();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    // The page hands off to the gateway and unloads, so the guard never releases.
    if (!run(() => undefined)) event.preventDefault();
  }

  return (
    <main className="grid min-h-[60vh] place-items-center bg-muted px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center p-8 text-center">
          <Spinner className="size-7 text-primary" />
          <h1 className="mt-5 text-xl font-semibold text-foreground">
            {t('payment.handoffTitle')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('payment.handoffDescription')}
          </p>
          <form
            ref={formRef}
            action={destination.actionUrl}
            method="post"
            className="mt-6 w-full"
            onSubmit={handleSubmit}
            aria-busy={submitting}
          >
            {Object.entries(destination.fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <Button type="submit" size="control" className="w-full" disabled={submitting}>
              {t('payment.handoffContinue')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
