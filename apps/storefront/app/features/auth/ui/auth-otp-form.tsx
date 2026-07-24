import { Button } from '@booking/ui/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@booking/ui/components/ui/field';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@booking/ui/components/ui/input-otp';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { AuthFormError, AuthSubmitButton } from './auth-form-controls';
import {
  useOtpFormController,
  type OtpActionData,
} from './use-otp-form-controller';

export function OtpForm({
  initialSeconds,
  actionData,
}: {
  initialSeconds: number;
  actionData?: OtpActionData;
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const { code, handleSubmit, resendCode, resending, seconds, setCode } = useOtpFormController({
    initialSeconds,
    actionData,
  });

  return (
    <div className="flex flex-col gap-6">
      <AuthFormError actionData={actionData} />
      <form onSubmit={handleSubmit}>
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
        disabled={seconds > 0 || resending}
        onClick={resendCode}
      >
        {seconds > 0 ? t('verify.resendIn', { seconds }) : t('verify.resend')}
      </Button>
    </div>
  );
}
