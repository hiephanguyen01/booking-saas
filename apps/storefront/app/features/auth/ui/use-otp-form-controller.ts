import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import type { AuthActionData } from '../../../lib/auth-types';

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
  const resendLockRef = useRef(false);
  const resendWasBusyRef = useRef(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(actionData?.resendAfterSec ?? initialSeconds);
  const [code, setCode] = useState('');
  const navigationIsResend =
    navigation.state !== 'idle' &&
    navigation.formMethod != null &&
    navigation.formData?.get('intent') === 'resend';

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

  useEffect(() => {
    if (navigationIsResend) {
      resendWasBusyRef.current = true;
      return;
    }

    if (navigation.state === 'idle' && resendWasBusyRef.current) {
      resendWasBusyRef.current = false;
      resendLockRef.current = false;
      setResending(false);
    }
  }, [navigation.state, navigationIsResend]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (code.length === 6) {
      submit({ code }, { method: 'post' });
    }
  }

  function resendCode(): void {
    if (seconds > 0 || resendLockRef.current) return;

    resendLockRef.current = true;
    setResending(true);
    try {
      submit({ intent: 'resend' }, { method: 'post' });
    } catch (error) {
      resendLockRef.current = false;
      setResending(false);
      throw error;
    }
  }

  return {
    code,
    handleSubmit,
    resendCode,
    resending,
    seconds,
    setCode,
  };
}
