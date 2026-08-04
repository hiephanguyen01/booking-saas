import type { Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { useSubmissionGuard } from '@booking/ui/hooks/use-submission-guard';
import type { FormEvent } from 'react';
import { Form, useNavigation } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { isPendingIntent } from '~/lib/form-navigation';

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
  const verificationPending = isPendingIntent(navigation, 'verify-access');
  const { busy: submitting, run } = useSubmissionGuard(verificationPending ? 'submitting' : 'idle');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    // The browser performs the submit; the guard only decides whether it may start.
    if (!run(() => undefined)) event.preventDefault();
  }

  return (
    <div className="space-y-5">
      <p className="rounded-(--sf-surface-radius) border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground">
        {t('lookup.otpSent')}
      </p>
      {devOtp ? (
        <p className="rounded-(--sf-surface-radius) bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
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
            className="font-mono tracking-[0.2em]"
            disabled={submitting}
          />
        </label>
        <Button type="submit" size="control" className="w-full" disabled={submitting}>
          {t('lookup.verify')}
        </Button>
      </Form>
    </div>
  );
}
