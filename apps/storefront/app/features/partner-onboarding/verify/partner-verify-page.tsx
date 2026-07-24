import { Button } from '@booking/ui/components/ui/button';
import { FieldError } from '@booking/ui/components/ui/field';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@booking/ui/components/ui/input-otp';
import { Mail } from 'lucide-react';
import { useOutletContext } from 'react-router';
import { useOtpFormController } from '../../auth/ui/use-otp-form-controller';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import type { StorefrontContext } from '../../../root';
import type { Route } from '../../../routes/partner-onboarding/+types/verify';
import {
  AuthSplit,
  FormAlert,
  FormHeading,
  PrimaryButton,
} from '../../../routes/partner-onboarding/shared';
import type { PartnerOnboardingActionData } from '../server/partner-onboarding-shared.server';

export function PartnerVerifyPage({ loaderData, actionData }: Route.ComponentProps) {
  const verifyActionData = actionData as PartnerOnboardingActionData | undefined;
  const { tenant } = useOutletContext<StorefrontContext>();
  const { t } = useTranslation(NsI18n.Auth);
  const { code, handleSubmit, resendCode, resending, seconds, setCode } = useOtpFormController({
    initialSeconds: loaderData.resendAfterSec,
    actionData: verifyActionData,
  });
  const message = verifyActionData?.error
    ? t(verifyActionData.error === 'OTP_INVALID' ? 'errors.invalidOtp' : 'errors.expired')
    : undefined;

  return (
    <AuthSplit tenantName={tenant.name}>
      <FormHeading
        title={t('verify.registrationTitle')}
        description={t('verify.description', { email: loaderData.maskedDestination ?? '' })}
      />
      <div className="mb-7 flex flex-col items-center">
        <span
          className="grid size-20 place-items-center rounded-full bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Mail className="size-9" strokeWidth={1.75} />
        </span>
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          {t('partner.verifyBadge')}
        </p>
      </div>
      <FormAlert>{message}</FormAlert>
      <form onSubmit={handleSubmit} className="space-y-7">
        <div className="flex flex-col items-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            autoFocus
            inputMode="numeric"
            aria-label={t('partner.otpLabel')}
          >
            <InputOTPGroup>
              {[0, 1, 2].map((index) => (
                <InputOTPSlot key={index} index={index} className="size-11" />
              ))}
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              {[3, 4, 5].map((index) => (
                <InputOTPSlot key={index} index={index} className="size-11" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <FieldError className="mt-2">{verifyActionData?.fieldErrors?.code?.[0]}</FieldError>
        </div>
        <PrimaryButton>{t('verify.submit')}</PrimaryButton>
      </form>
      <Button
        type="button"
        variant="ghost"
        disabled={seconds > 0 || resending}
        onClick={resendCode}
        className="mx-auto mt-5 flex text-primary hover:text-primary"
      >
        {seconds > 0 ? t('verify.resendIn', { seconds }) : t('verify.resend')}
      </Button>
    </AuthSplit>
  );
}
