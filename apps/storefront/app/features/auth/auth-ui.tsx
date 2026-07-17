import {
  loginInputSchema,
  passwordResetStartInputSchema,
  passwordSchema,
  registrationStartInputSchema,
} from '@booking/contracts';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@booking/ui/components/ui/field';
import { Input } from '@booking/ui/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@booking/ui/components/ui/input-group';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@booking/ui/components/ui/input-otp';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigation, useSubmit } from 'react-router';
import { z } from 'zod';
import type { AuthActionData } from '../../lib/auth-types';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import type { StorefrontTenant } from '../../lib/tenant.server';

export function AuthFrame({
  tenant,
  title,
  description,
  split = false,
  children,
}: {
  tenant: StorefrontTenant;
  title: string;
  description: string;
  split?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <section className="mx-auto flex w-full max-w-292.5 items-stretch overflow-hidden rounded-sm border bg-card shadow-lg">
      {split ? (
        <aside className="relative hidden min-h-157.5 w-1/2 max-w-[585px] overflow-hidden bg-primary/10 p-10 lg:flex lg:flex-col lg:justify-end">
          {tenant.themeConfig.hero?.imageUrl ? (
            <img
              src={tenant.themeConfig.hero.imageUrl}
              alt=""
              width={1170}
              height={1260}
              className="absolute inset-0 size-full object-cover opacity-45"
            />
          ) : null}
          <div className="absolute inset-0 bg-linear-to-t from-primary/45 via-primary/12 to-background/20" />
          <div className="relative max-w-md rounded-sm border border-white/40 bg-background/90 p-6 backdrop-blur-sm">
            {tenant.themeConfig.logoUrl ? (
              <img
                src={tenant.themeConfig.logoUrl}
                alt={tenant.name}
                width={150}
                height={48}
                className="mb-5 h-10 w-auto object-contain"
              />
            ) : (
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-primary">
                {tenant.name}
              </p>
            )}
            <p className="text-xl font-semibold tracking-tight">{t('promo.title')}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('promo.description')}</p>
          </div>
        </aside>
      ) : null}
      <div
        className={
          split
            ? 'flex min-h-157.5 flex-1 items-center px-6 py-10 sm:px-12 lg:px-14'
            : 'w-full px-6 py-12 sm:px-12'
        }
      >
        <div className="mx-auto w-full max-w-122">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

function messageFor(
  error: string | undefined,
  t: ReturnType<typeof useTranslation<typeof NsI18n.Auth>>['t'],
) {
  if (!error) return null;
  if (error === 'INVALID_CREDENTIALS' || error === 'ACCOUNT_NOT_FOUND')
    return t('errors.invalidCredentials');
  if (error === 'ACCOUNT_LOCKED') return t('errors.accountLocked');
  if (error === 'EMAIL_TAKEN') return t('errors.emailTaken');
  if (error === 'OTP_INVALID') return t('errors.invalidOtp');
  if (error === 'CHALLENGE_EXPIRED' || error === 'OTP_ATTEMPTS_EXCEEDED')
    return t('errors.expired');
  return t('errors.generic');
}

function FormError({ actionData }: { actionData?: AuthActionData }) {
  const { t } = useTranslation(NsI18n.Auth);
  const message = messageFor(actionData?.error, t);
  return message ? (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null;
}

function SubmitButton({ children }: { children: ReactNode }) {
  const navigation = useNavigation();
  // Every auth action redirects on success, so the navigation continues into a
  // 'loading' phase after the action resolves. Gating on 'submitting' alone
  // re-enabled the button mid-redirect and left a double-submit window; the
  // formMethod check keeps this scoped to submission-driven navigations.
  const pending = navigation.state !== 'idle' && navigation.formMethod != null;
  return (
    <Button type="submit" size="control" className="w-full text-base" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </Button>
  );
}

export function SocialButtons() {
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <div className="mt-8">
      <FieldSeparator>{t('social.or')}</FieldSeparator>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[t('social.google'), t('social.facebook')].map((label) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            size="control"
            aria-disabled="true"
            disabled
          >
            <span>{label}</span>
            <span className="sr-only"> - {t('social.soon')}</span>
          </Button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">{t('social.soon')}</p>
    </div>
  );
}

export function StartForm({
  mode,
  locale,
  actionData,
}: {
  mode: 'register' | 'login' | 'reset';
  locale: 'vi' | 'en';
  actionData?: AuthActionData;
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const submit = useSubmit();
  const schema = z.object({
    fullName:
      mode === 'register' ? registrationStartInputSchema.shape.fullName : z.string().optional(),
    email:
      mode === 'login'
        ? loginInputSchema.shape.email
        : mode === 'reset'
          ? passwordResetStartInputSchema.shape.email
          : registrationStartInputSchema.shape.email,
    password: mode === 'login' ? loginInputSchema.shape.password : z.string().optional(),
  });
  type Values = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    defaultValues: { fullName: '', email: '', password: '' },
  });
  return (
    <form onSubmit={handleSubmit((values) => submit(values, { method: 'post' }))} noValidate>
      <FieldGroup className="gap-5">
        <FormError actionData={actionData} />
        {mode === 'register' ? (
          <Field data-invalid={Boolean(errors.fullName || actionData?.fieldErrors?.fullName)}>
            <FieldLabel htmlFor="fullName">{t('fields.fullName')}</FieldLabel>
            <div className="relative">
              <UserRound className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fullName"
                autoComplete="name"
                className="pl-11"
                aria-invalid={Boolean(errors.fullName)}
                {...register('fullName')}
              />
            </div>
            <FieldError errors={[errors.fullName]}>
              {actionData?.fieldErrors?.fullName?.[0]}
            </FieldError>
          </Field>
        ) : null}
        <Field data-invalid={Boolean(errors.email || actionData?.fieldErrors?.email)}>
          <FieldLabel htmlFor="email">{t('fields.email')}</FieldLabel>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              className="pl-11"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
          </div>
          <FieldError errors={[errors.email]}>{actionData?.fieldErrors?.email?.[0]}</FieldError>
        </Field>
        {mode === 'login' ? (
          <Field data-invalid={Boolean(errors.password || actionData?.fieldErrors?.password)}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">{t('fields.password')}</FieldLabel>
              <Link
                to={storefrontPaths.forgotPassword(locale)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('login.forgot')}
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              registration={register('password')}
              invalid={Boolean(errors.password)}
            />
            <FieldError errors={[errors.password]}>
              {actionData?.fieldErrors?.password?.[0]}
            </FieldError>
          </Field>
        ) : null}
        <SubmitButton>
          {mode === 'register'
            ? t('register.submit')
            : mode === 'reset'
              ? t('forgot.submit')
              : t('login.submit')}
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}

function PasswordInput({
  id,
  autoComplete,
  registration,
  invalid,
}: {
  id: string;
  autoComplete: string;
  registration: ReturnType<ReturnType<typeof useForm>['register']>;
  invalid?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup>
      <InputGroupAddon>
        <LockKeyhole />
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        {...registration}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? t('password.hide') : t('password.show')}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export function OtpForm({
  initialSeconds,
  actionData,
}: {
  initialSeconds: number;
  actionData?: AuthActionData & { resendAfterSec?: number };
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const submit = useSubmit();
  const [seconds, setSeconds] = useState(actionData?.resendAfterSec ?? initialSeconds);
  const [code, setCode] = useState('');
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [seconds]);
  // Keyed on the response object, not on resendAfterSec: the server returns the
  // same cooldown every time, so depending on the value skipped this effect from
  // the second resend onward and the countdown never restarted.
  useEffect(() => {
    if (actionData?.resendAfterSec != null) setSeconds(actionData.resendAfterSec);
  }, [actionData]);
  return (
    <div className="flex flex-col gap-6">
      <FormError actionData={actionData} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === 6) submit({ code }, { method: 'post' });
        }}
      >
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
          <SubmitButton>{t('verify.submit')}</SubmitButton>
        </FieldGroup>
      </form>
      <Button
        type="button"
        variant="ghost"
        className="mx-auto"
        disabled={seconds > 0}
        onClick={() => submit({ intent: 'resend' }, { method: 'post' })}
      >
        {seconds > 0 ? t('verify.resendIn', { seconds }) : t('verify.resend')}
      </Button>
    </div>
  );
}

export function NewPasswordForm({
  mode,
  actionData,
}: {
  mode: 'registration' | 'reset';
  actionData?: AuthActionData;
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const submit = useSubmit();
  const schema = z
    .object({
      password: passwordSchema,
      confirmPassword: z.string(),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ['confirmPassword'],
      message: t('errors.passwordMismatch'),
    });
  type Values = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    defaultValues: { password: '', confirmPassword: '' },
  });
  return (
    <form onSubmit={handleSubmit((values) => submit(values, { method: 'post' }))} noValidate>
      <FieldGroup className="gap-5">
        <FormError actionData={actionData} />
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">{t('password.label')}</FieldLabel>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            registration={register('password')}
            invalid={Boolean(errors.password)}
          />
          <FieldError errors={[errors.password]}>
            {actionData?.fieldErrors?.password?.[0]}
          </FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword">{t('password.confirm')}</FieldLabel>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            registration={register('confirmPassword')}
            invalid={Boolean(errors.confirmPassword)}
          />
          <FieldError errors={[errors.confirmPassword]}>
            {errors.confirmPassword?.message ??
              (actionData?.fieldErrors?.confirmPassword?.[0] ? t('errors.passwordMismatch') : null)}
          </FieldError>
        </Field>
        <SubmitButton>
          {mode === 'registration' ? t('password.submitRegistration') : t('password.submitReset')}
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}

export function SuccessState({
  mode,
  locale,
}: {
  mode: 'registration' | 'reset';
  locale: 'vi' | 'en';
}) {
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
        {mode === 'registration' ? (
          <ShieldCheck className="size-10" />
        ) : (
          <CheckCircle2 className="size-10" />
        )}
      </div>
      <Button asChild size="control" className="w-full text-base">
        <Link to={storefrontPaths.login(locale)}>{t('success.login')}</Link>
      </Button>
    </div>
  );
}
