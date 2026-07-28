import { Button } from '@booking/ui/components/ui/button';
import { Spinner } from '@booking/ui/components/ui/spinner';
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Form, useNavigation } from 'react-router';
import { createSubmissionLock } from '~/lib/submission-lock';
import { isBookingPaymentNavigation } from '~/features/account/lib/booking-payment-navigation';

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
  const submitLockRef = useRef(createSubmissionLock());
  const navigationWasBusyRef = useRef(false);
  const [locked, setLocked] = useState(false);
  const paymentPending = isBookingPaymentNavigation(navigation);

  useEffect(() => {
    if (paymentPending) {
      navigationWasBusyRef.current = true;
      return;
    }

    if (navigation.state === 'idle' && navigationWasBusyRef.current) {
      navigationWasBusyRef.current = false;
      submitLockRef.current.release();
      setLocked(false);
    }
  }, [navigation.state, paymentPending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (!submitLockRef.current.tryAcquire()) {
      event.preventDefault();
      return;
    }
    setLocked(true);
  }

  const pending = locked || paymentPending;

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
