import type { Locale } from '@booking/i18n';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import { Field, FieldError, FieldLabel } from '@booking/ui/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@booking/ui/components/ui/input-group';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { Eye, EyeOff, Mail } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigation } from 'react-router';
import { isFormNavigationPending } from '../../auth/ui/otp-submission-state';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import { usePasswordVisibility } from '../../../lib/use-password-visibility';

export function EmailField({ defaultValue, error }: { defaultValue?: string; error?: string }) {
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="email">{t('partner.emailLabel')}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <Mail />
        </InputGroupAddon>
        <InputGroupInput
          id="email"
          name="email"
          type="email"
          defaultValue={defaultValue}
          autoComplete="email"
          autoFocus
          aria-invalid={Boolean(error)}
          placeholder={t('partner.emailPlaceholder')}
        />
      </InputGroup>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function PasswordField({
  name,
  label,
  error,
  autoFocus,
}: {
  name: string;
  label: string;
  error?: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const { inputType, toggle, visible } = usePasswordVisibility();
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={name}
          name={name}
          type={inputType}
          autoComplete="new-password"
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-sm"
            onClick={toggle}
            aria-label={visible ? t('password.hide') : t('password.show')}
          >
            {visible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function PrimaryButton({ children }: { children: ReactNode }) {
  const navigation = useNavigation();
  const pending = isFormNavigationPending(navigation);
  return (
    <Button type="submit" size="control" className="w-full text-base" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </Button>
  );
}

export function LoginPrompt({ locale }: { locale: Locale }) {
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <p className="mt-10 text-center text-sm font-medium text-muted-foreground">
      {t('register.hasAccount')}{' '}
      <Link
        to={storefrontPaths.login(locale, storefrontPaths.becomePartner(locale))}
        className="font-semibold text-primary hover:underline"
      >
        {t('register.login')}
      </Link>
    </p>
  );
}

export function FormAlert({ children }: { children?: ReactNode }) {
  return children ? (
    <Alert variant="destructive" className="mb-5">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  ) : null;
}
