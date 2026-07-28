import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@booking/ui/components/ui/input-group';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useNavigation } from 'react-router';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '@booking/i18n';
import { usePasswordVisibility } from '~/hooks/use-password-visibility';

function messageFor(
  error: string | undefined,
  t: ReturnType<typeof useTranslation<typeof NsI18n.Auth>>['t'],
) {
  if (!error) return null;
  if (error === 'INVALID_CREDENTIALS' || error === 'ACCOUNT_NOT_FOUND') {
    return t('errors.invalidCredentials');
  }
  if (error === 'ACCOUNT_LOCKED') return t('errors.accountLocked');
  if (error === 'EMAIL_TAKEN') return t('errors.emailTaken');
  if (error === 'OTP_INVALID') return t('errors.invalidOtp');
  if (error === 'CHALLENGE_EXPIRED' || error === 'OTP_ATTEMPTS_EXCEEDED') {
    return t('errors.expired');
  }
  return t('errors.generic');
}

export function AuthFormError({ actionData }: { actionData?: AuthActionData }) {
  const { t } = useTranslation(NsI18n.Auth);
  const message = messageFor(actionData?.error, t);

  return message ? (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null;
}

export function AuthSubmitButton({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const navigation = useNavigation();
  // Every auth action redirects on success, so the navigation continues into a
  // 'loading' phase after the action resolves. Gating on 'submitting' alone
  // re-enabled the button mid-redirect and left a double-submit window; the
  // formMethod check keeps this scoped to submission-driven navigations.
  const pending = disabled || (navigation.state !== 'idle' && navigation.formMethod != null);

  return (
    <Button type="submit" size="control" className="w-full text-base" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </Button>
  );
}

export function AuthPasswordInput({
  id,
  autoComplete,
  registration,
  invalid,
  disabled = false,
}: {
  id: string;
  autoComplete: string;
  registration: UseFormRegisterReturn;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const { inputType, toggle, visible } = usePasswordVisibility();

  return (
    <InputGroup>
      <InputGroupAddon>
        <LockKeyhole />
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        type={inputType}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        disabled={disabled}
        {...registration}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          onClick={toggle}
          aria-label={visible ? t('password.hide') : t('password.show')}
          disabled={disabled}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
