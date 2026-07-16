import { Button } from '@booking/ui/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@booking/ui/components/ui/input-otp';
import { Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Form, useActionData, useLoaderData, useSubmit } from 'react-router';
import { requirePartnerView, verifyPartnerRegistration, type PartnerOnboardingActionData } from '../../lib/partner-onboarding.server';
import { AuthSplit, FieldError, FormAlert, FormHeading, PrimaryButton } from './shared';
import type { Route } from './+types/verify';

export const meta = () => [{ title: 'Xác thực email · Booking Studio' }, { name: 'robots', content: 'noindex,nofollow' }];
export const loader = ({ request, params }: Route.LoaderArgs) => requirePartnerView(request, 'partner_registration_verify', params.locale);
export const action = ({ request, params }: Route.ActionArgs) => verifyPartnerRegistration(request, params.locale);

export default function PartnerVerify() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<PartnerOnboardingActionData>();
  const submit = useSubmit();
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(actionData?.resendAfterSec ?? loaderData.resendAfterSec);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [seconds]);
  useEffect(() => {
    if (actionData?.resendAfterSec != null) setSeconds(actionData.resendAfterSec);
  }, [actionData?.resendAfterSec]);
  const message = actionData?.error === 'OTP_INVALID' ? 'Mã xác thực không đúng.' : actionData?.error ? 'Phiên xác thực đã hết hạn. Vui lòng đăng ký lại.' : undefined;
  return (
    <AuthSplit>
      <FormHeading title="Xác thực email" description={<>Mã xác thực đã được gửi tới <strong className="font-semibold text-[#344054]">{loaderData.maskedDestination}</strong></>} />
      <div className="mb-7 flex flex-col items-center">
        <span className="grid size-20 place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
          <Mail className="size-9" strokeWidth={1.75} />
        </span>
        <p className="mt-2 text-xs font-medium text-[#667085]">Xác thực email của bạn</p>
      </div>
      <FormAlert>{message}</FormAlert>
      <Form method="post" onSubmit={(event) => { if (code.length !== 6) event.preventDefault(); }} className="space-y-7">
        <input type="hidden" name="code" value={code} />
        <div className="flex flex-col items-center">
          <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus inputMode="numeric" aria-label="Mã xác thực 6 số">
            <InputOTPGroup>{[0, 1, 2].map((index) => <InputOTPSlot key={index} index={index} className="h-14 w-12 sm:w-14" />)}</InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>{[3, 4, 5].map((index) => <InputOTPSlot key={index} index={index} className="h-14 w-12 sm:w-14" />)}</InputOTPGroup>
          </InputOTP>
          <FieldError>{actionData?.fieldErrors?.code?.[0]}</FieldError>
        </div>
        <PrimaryButton>Xác thực</PrimaryButton>
      </Form>
      <Button type="button" variant="ghost" disabled={seconds > 0} onClick={() => submit({ intent: 'resend' }, { method: 'post' })} className="mx-auto mt-5 flex text-primary hover:text-primary">
        {seconds > 0 ? `Gửi lại sau ${seconds}s` : 'Gửi lại mã xác thực'}
      </Button>
    </AuthSplit>
  );
}
