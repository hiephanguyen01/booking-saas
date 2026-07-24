import { useEffect, useState, type FormEvent } from 'react';
import { useSubmit } from 'react-router';
import type { AuthActionData } from '../../../lib/auth-types';

export type OtpActionData = AuthActionData & { resendAfterSec?: number };

export function useOtpFormController({
  initialSeconds,
  actionData,
}: {
  initialSeconds: number;
  actionData?: OtpActionData;
}) {
  const submit = useSubmit();
  const [seconds, setSeconds] = useState(actionData?.resendAfterSec ?? initialSeconds);
  const [code, setCode] = useState('');

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
    if (code.length === 6) {
      submit({ code }, { method: 'post' });
    }
  }

  function resendCode(): void {
    submit({ intent: 'resend' }, { method: 'post' });
  }

  return {
    code,
    handleSubmit,
    resendCode,
    seconds,
    setCode,
  };
}
