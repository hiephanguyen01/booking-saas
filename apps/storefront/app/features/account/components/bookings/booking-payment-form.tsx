import { Button } from '@booking/ui/components/ui/button';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { useSubmissionGuard } from '@booking/ui/hooks/use-submission-guard';
import type { ComponentProps, FormEvent, ReactNode } from 'react';
import { Form, useNavigation } from 'react-router';
import { isPendingIntent } from '~/lib/form-navigation';

export function BookingPaymentForm({
  action,
  children,
  buttonProps,
}: {
  action?: string;
  children: ReactNode;
  buttonProps?: ComponentProps<typeof Button>;
}) {
  const navigation = useNavigation();
  const paymentPending = isPendingIntent(navigation, 'pay');
  const { busy: pending, run } = useSubmissionGuard(paymentPending ? 'submitting' : 'idle');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    // The browser performs the submit; the guard only decides whether it may start.
    if (!run(() => undefined)) event.preventDefault();
  }

  return (
    <Form method="post" action={action} onSubmit={handleSubmit}>
      <input type="hidden" name="intent" value="pay" />
      <Button {...buttonProps} disabled={buttonProps?.disabled || pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {children}
      </Button>
    </Form>
  );
}
