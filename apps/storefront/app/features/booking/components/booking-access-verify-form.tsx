import type { Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Form, useNavigation } from 'react-router';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/constants/paths';
import { createSubmissionLock } from '~/lib/submission-lock';
import { isBookingAccessNavigation } from '~/features/booking/lib/booking-access-navigation';

export function BookingAccessVerifyForm({
  code,
  devOtp,
  locale,
}: {
  code: string;
  devOtp: string | null;
  locale: Locale;
}) {
  const { t } = useTranslation(NsI18n.Booking);
  const navigation = useNavigation();
  const submitLockRef = useRef(createSubmissionLock());
  const navigationWasBusyRef = useRef(false);
  const [locked, setLocked] = useState(false);
  const verificationPending = isBookingAccessNavigation(navigation);
  const submitting = locked || verificationPending;

  useEffect(() => {
    if (verificationPending) {
      navigationWasBusyRef.current = true;
      return;
    }

    if (navigation.state === 'idle' && navigationWasBusyRef.current) {
      navigationWasBusyRef.current = false;
      submitLockRef.current.release();
      setLocked(false);
    }
  }, [navigation.state, verificationPending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (!submitLockRef.current.tryAcquire()) {
      event.preventDefault();
      return;
    }
    setLocked(true);
  }

  return (
    <div className="space-y-5">
      <p className="rounded-sm border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground">
        {t('lookup.otpSent')}
      </p>
      {devOtp ? (
        <p className="rounded-sm bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
          {t('lookup.otpHintDev', { otp: devOtp })}
        </p>
      ) : null}
      <Form
        method="post"
        action={storefrontPaths.booking(locale, code)}
        className="space-y-5"
        onSubmit={handleSubmit}
        aria-busy={submitting}
      >
        <input type="hidden" name="intent" value="verify-access" />
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">{t('lookup.otpLabel')}</span>
          <Input
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            className="h-12 rounded-sm font-mono tracking-[0.2em]"
            disabled={submitting}
          />
        </label>
        <Button type="submit" className="h-12 w-full rounded-sm" disabled={submitting}>
          {t('lookup.verify')}
        </Button>
      </Form>
    </div>
  );
}
