import {
  customerAccountSettingsInputSchema,
  type CustomerAccountSettingsInput,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Avatar, AvatarFallback, AvatarImage } from '@booking/ui/components/ui/avatar';
import { Button } from '@booking/ui/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { data, useOutletContext } from 'react-router';
import { AccountPanel } from '../../features/account/components/account-primitives';
import { userInitials } from '../../features/account/account-nav';
import { requireAuth } from '../../lib/auth.server';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import type { AccountOutletContext } from './layout';
import type { Route } from './+types/profile';

type ProfileActionData = {
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string[] | undefined> | null;
};

const ACCOUNT_AVATAR_PLACEHOLDER = '/images/booking-studio/home/promo-photographer.png';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  requireAuth(storefrontPaths.login(locale, new URL(request.url).pathname));
  return null;
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  requireAuth(storefrontPaths.login(locale, new URL(request.url).pathname));
  const body: unknown = await request.json().catch(() => ({}));
  const value = body && typeof body === 'object' ? body : {};
  const parsed = customerAccountSettingsInputSchema.safeParse(value);

  if (!parsed.success) {
    return data<ProfileActionData>(
      {
        saved: false,
        error: null,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  return data<ProfileActionData>({ saved: true, error: null, fieldErrors: null });
}

export default function ProfilePage({ actionData }: Route.ComponentProps) {
  const { user } = useOutletContext<AccountOutletContext>();
  const { t } = useTranslation(NsI18n.Account);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    },
    [avatarUrl],
  );

  const fields: FieldConfig<CustomerAccountSettingsInput>[] = [
    {
      name: 'fullName',
      type: 'text',
      label: t('profile.fullName'),
      placeholder: t('profile.placeholder'),
      autoComplete: 'name',
    },
    {
      name: 'email',
      type: 'email',
      label: t('profile.email'),
      placeholder: t('profile.placeholder'),
      autoComplete: 'email',
    },
    {
      name: 'phone',
      type: 'text',
      label: t('profile.phone'),
      placeholder: t('profile.placeholder'),
      autoComplete: 'tel',
      disabled: true,
    },
    {
      name: 'currentPassword',
      type: 'password',
      label: t('profile.currentPassword'),
      placeholder: t('profile.placeholder'),
      autoComplete: 'current-password',
    },
    {
      name: 'newPassword',
      type: 'password',
      label: t('profile.newPassword'),
      placeholder: t('profile.placeholder'),
      autoComplete: 'new-password',
    },
    {
      name: 'confirmPassword',
      type: 'password',
      label: t('profile.confirmPassword'),
      placeholder: t('profile.placeholder'),
      autoComplete: 'new-password',
    },
  ];

  return (
    <AccountPanel className="rounded-none px-6 py-8 sm:px-8 lg:px-10">
      <h1 className="text-lg font-semibold leading-7 text-foreground">{t('profile.title')}</h1>

      <div className="mt-6 flex items-center gap-4">
        <Avatar className="size-18">
          <AvatarImage
            src={avatarUrl ?? ACCOUNT_AVATAR_PLACEHOLDER}
            alt=""
            className="object-cover"
          />
          <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
            {userInitials(user.fullName)}
          </AvatarFallback>
        </Avatar>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            if (avatarUrl) URL.revokeObjectURL(avatarUrl);
            setAvatarUrl(URL.createObjectURL(file));
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-sm border-foreground/75 px-4 text-xs font-semibold shadow-xs"
          onClick={() => inputRef.current?.click()}
        >
          {t('profile.choosePhoto')}
        </Button>
      </div>

      {actionData?.saved ? <SuccessNotice text={t('profile.saved')} /> : null}

      <GenericForm
        schema={customerAccountSettingsInputSchema}
        fields={fields}
        defaultValues={{
          fullName: user.fullName,
          email: user.email,
          phone: user.phone ?? '',
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }}
        submitLabel={t('profile.save')}
        fieldErrors={actionData?.fieldErrors}
        renderFields={(renderedFields) => {
          const field = new Map(renderedFields.map((item) => [item.name, item.node]));
          return (
            <div>
              <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,375px)_minmax(0,375px)]">
                <CustomerIdField
                  label={t('profile.customerId')}
                  value={`CUS${user.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`}
                />
                {field.get('fullName')}
                {field.get('email')}
                {field.get('phone')}
              </div>

              <section className="mt-10 border-t border-border pt-[39px]">
                <h2 className="text-lg font-semibold leading-7 text-foreground">
                  {t('profile.passwordTitle')}
                </h2>
                <div className="mt-6 grid max-w-[375px] gap-6">
                  {field.get('currentPassword')}
                  {field.get('newPassword')}
                  {field.get('confirmPassword')}
                </div>
                <PasswordRules />
              </section>
            </div>
          );
        }}
        className="mt-6 [&>div:last-child]:mt-10 [&>div:last-child]:justify-center [&_[data-slot=form-item]]:gap-2 [&_[data-slot=form-label]]:text-sm [&_[data-slot=form-label]]:font-medium [&_[data-slot=form-label]]:leading-5 [&_[data-slot=input]]:h-11 [&_[data-slot=input]]:rounded-sm [&_[data-slot=input]]:px-4 [&_[data-slot=input]]:font-medium [&_[data-slot=input]:disabled]:bg-muted [&_[data-slot=input]:disabled]:opacity-100 [&_[type=submit]]:h-12 [&_[type=submit]]:w-[min(240px,100%)] [&_[type=submit]]:rounded-sm [&_[type=submit]]:px-5 [&_[type=submit]]:text-base"
      />
    </AccountPanel>
  );
}

function CustomerIdField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium leading-5 text-foreground/80">{label}</span>
      <span className="flex h-11 items-center rounded-sm border border-input bg-muted px-4 text-sm font-medium text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

function PasswordRules() {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <div className="mt-6 space-y-2 text-sm leading-5 text-muted-foreground">
      <p>{t('profile.passwordRuleLength')}</p>
      <p>{t('profile.passwordRuleLetter')}</p>
      <p>{t('profile.passwordRuleNumber')}</p>
    </div>
  );
}

function SuccessNotice({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="mt-6 flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
    >
      <CheckCircle2 className="size-4" />
      {text}
    </div>
  );
}
