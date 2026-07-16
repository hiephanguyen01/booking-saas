import { createTranslator, isLocale, type Locale, type TranslationKey } from '@booking/i18n';
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
import { cn } from '@booking/ui/lib/utils';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigation } from 'react-router';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';

const META_TITLE_KEYS = {
  start: 'auth.partner.meta.start',
  verify: 'auth.partner.meta.verify',
  password: 'auth.partner.meta.password',
  profile: 'auth.partner.meta.profile',
  done: 'auth.partner.meta.done',
  affiliate: 'auth.affiliate.meta',
} as const satisfies Record<string, TranslationKey>;

type OnboardingMetaStep = keyof typeof META_TITLE_KEYS;

/**
 * Meta tags for an onboarding step.
 *
 * The storefront is white-label — one deployment serves every tenant, resolved
 * from the `Host` header — so the title must carry the resolved tenant's name.
 * `tenantName` comes from the root match, which is the only loader that resolves it.
 */
export function partnerMeta(
  tenantName: string | undefined,
  locale: string | undefined,
  step: OnboardingMetaStep,
): Array<Record<string, string>> {
  const { t } = createTranslator(isLocale(locale) ? locale : 'vi');
  const title = t(META_TITLE_KEYS[step]);
  return [
    { title: tenantName ? `${title} · ${tenantName}` : title },
    { name: 'robots', content: 'noindex,nofollow' },
  ];
}

export function PromoPanel({ tenantName }: { tenantName: string }) {
  const { t } = useTranslation([NsI18n.Auth, NsI18n.Common]);
  return (
    <section className="flex w-full max-w-[486px] flex-col">
      {/* Not a heading: the step's own <h1> is the page title, and this panel is
          hidden below `lg`, which would leave small screens without one. */}
      <p className="text-[34px] font-semibold leading-[1.55] tracking-[-0.025em] text-foreground sm:text-[40px] sm:leading-[1.4]">
        {t('auth:partner.promoTitle')}
      </p>
      <p className="mt-3 max-w-[448px] text-sm font-medium leading-6 text-muted-foreground">
        {t('common:becomePartner.subtitle', { tenant: tenantName })}
      </p>
      <img
        src="/images/partner-onboarding/growth-illustration.svg"
        alt=""
        aria-hidden="true"
        className="mx-auto mt-10 w-full"
      />
    </section>
  );
}

export function AuthSplit({
  children,
  tenantName,
  tall = false,
}: {
  children: ReactNode;
  tenantName: string;
  tall?: boolean;
}) {
  return (
    <main className="mx-auto grid w-full max-w-292.5 grid-cols-1 gap-10 px-5 pb-16 lg:grid-cols-[486px_566px] lg:justify-between lg:px-0 lg:pt-10">
      <div className="hidden lg:block">
        <PromoPanel tenantName={tenantName} />
      </div>
      <section
        className={cn(
          'w-full self-center bg-card px-6 py-10 text-card-foreground shadow-sm sm:px-10',
          tall && 'min-h-[548px]',
        )}
      >
        {children}
      </section>
    </main>
  );
}

export function FormHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-10">
      <h1 className="text-2xl font-semibold leading-9 text-foreground">{title}</h1>
      {description ? (
        <div className="mt-6 text-base font-medium leading-6 text-muted-foreground">
          {description}
        </div>
      ) : null}
    </div>
  );
}

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
  const [visible, setVisible] = useState(false);
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={name}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-sm"
            onClick={() => setVisible((value) => !value)}
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
  const pending = navigation.state === 'submitting';
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
