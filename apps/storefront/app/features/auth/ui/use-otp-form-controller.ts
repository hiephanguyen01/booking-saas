import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import type { AuthActionData } from '../../../lib/auth-types';
import { otpSubmissionIntent } from './otp-submission-state';

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
  const verifyLockRef = useRef(false);
  const verifyWasBusyRef = useRef(false);
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [seconds, setSeconds] = useState(actionData?.resendAfterSec ?? initialSeconds);
  const [code, setCode] = useState('');
  const submissionIntent = otpSubmissionIntent(navigation);
  const navigationIsResend = submissionIntent === 'resend';
  const navigationIsVerify = submissionIntent === 'verify';

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
    if (navigationIsResend) resendWasBusyRef.current = true;
    if (navigationIsVerify) verifyWasBusyRef.current = true;
    if (navigation.state !== 'idle') return;

    if (resendWasBusyRef.current) {
      resendWasBusyRef.current = false;
      resendLockRef.current = false;
      setResending(false);
    }
    if (verifyWasBusyRef.current) {
      verifyWasBusyRef.current = false;
      verifyLockRef.current = false;
      setVerifying(false);
    }
  }, [navigation.state, navigationIsResend, navigationIsVerify]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (code.length !== 6 || verifyLockRef.current) return;

    verifyLockRef.current = true;
    setVerifying(true);
    try {
      submit({ code }, { method: 'post' });
    } catch (error) {
      verifyLockRef.current = false;
      setVerifying(false);
      throw error;
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
    verifying,
  };
}
