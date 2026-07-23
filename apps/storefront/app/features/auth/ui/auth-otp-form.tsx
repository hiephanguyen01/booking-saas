import { Button } from '@booking/ui/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@booking/ui/components/ui/field';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@booking/ui/components/ui/input-otp';
import { useEffect, useState } from 'react';
import { useSubmit } from 'react-router';
import type { AuthActionData } from '../../../lib/auth-types';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { AuthFormError, AuthSubmitButton } from './auth-form-controls';

export function OtpForm({
  initialSeconds,
  actionData,
}: {
  initialSeconds: number;
  actionData?: AuthActionData & { resendAfterSec?: number };
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const submit = useSubmit();
  const [seconds, setSeconds] = useState(actionData?.resendAfterSec ?? initialSeconds);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  // Keyed on the response object, not on resendAfterSec: the server returns the
  // same cooldown every time, so depending on the value skipped this effect from
  // the second resend onward and the countdown never restarted.
  useEffect(() => {
    if (actionData?.resendAfterSec != null) setSeconds(actionData.resendAfterSec);
  }, [actionData]);

  return (
    <div className="flex flex-col gap-6">
      <AuthFormError actionData={actionData} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === 6) submit({ code }, { method: 'post' });
        }}
      >
        <FieldGroup className="gap-6">
          <Field data-invalid={Boolean(actionData?.fieldErrors?.code)}>
            <FieldLabel htmlFor="otp-code" className="justify-center">
              {t('verify.code')}
            </FieldLabel>
            <InputOTP
              id="otp-code"
              maxLength={6}
              value={code}
              onChange={setCode}
              inputMode="numeric"
              autoFocus
              containerClassName="justify-center"
              aria-label={t('verify.code')}
              aria-invalid={Boolean(actionData?.fieldErrors?.code)}
            >
              <InputOTPGroup>
                {[0, 1, 2].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="h-11 w-11 sm:h-16 sm:w-16 sm:text-xl"
                  />
                ))}
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                {[3, 4, 5].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="h-11 w-11 sm:h-16 sm:w-16 sm:text-xl"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <FieldError className="text-center">{actionData?.fieldErrors?.code?.[0]}</FieldError>
          </Field>
          <AuthSubmitButton>{t('verify.submit')}</AuthSubmitButton>
        </FieldGroup>
      </form>
      <Button
        type="button"
        variant="ghost"
        className="mx-auto"
        disabled={seconds > 0}
        onClick={() => submit({ intent: 'resend' }, { method: 'post' })}
      >
        {seconds > 0 ? t('verify.resendIn', { seconds }) : t('verify.resend')}
      </Button>
    </div>
  );
}
