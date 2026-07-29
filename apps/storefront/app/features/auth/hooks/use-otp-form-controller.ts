import { useSubmissionGuard } from '@booking/ui/hooks/use-submission-guard';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import type { AuthActionData } from '~/lib/auth-types';
import { otpSubmissionIntent } from '~/features/auth/lib/otp-submission-state';

export type OtpActionData = AuthActionData & { resendAfterSec?: number };

type OtpCooldownActionData = { resendAfterSec?: number };

export function useOtpFormController<TActionData extends OtpCooldownActionData>({
  initialSeconds,
  actionData,
}: {
  initialSeconds: number;
  actionData?: TActionData;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const [seconds, setSeconds] = useState(actionData?.resendAfterSec ?? initialSeconds);
  const [code, setCode] = useState('');
  const submissionIntent = otpSubmissionIntent(navigation);
  // One guard per button: each closes its own event-to-render gap, and each blocks
  // while the other is in flight so a resend cannot race a verify.
  const verify = useSubmissionGuard(submissionIntent === 'verify' ? 'submitting' : 'idle');
  const resend = useSubmissionGuard(submissionIntent === 'resend' ? 'submitting' : 'idle');

  useEffect(() => {
    if (seconds <= 0) return;

    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  // Keyed on the response object, not on resendAfterSec: the server returns the
  // same cooldown every time, so depending on the value would skip restarting
  // the countdown after a subsequent resend response.
  useEffect(() => {
    if (actionData?.resendAfterSec != null) {
      setSeconds(actionData.resendAfterSec);
    }
  }, [actionData]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (code.length !== 6 || resend.busy) return;
    verify.run(() => submit({ code }, { method: 'post' }));
  }

  function resendCode(): void {
    if (seconds > 0 || verify.busy) return;
    resend.run(() => submit({ intent: 'resend' }, { method: 'post' }));
  }

  return {
    code,
    handleSubmit,
    resendCode,
    resending: resend.busy,
    seconds,
    setCode,
    verifying: verify.busy,
  };
}
