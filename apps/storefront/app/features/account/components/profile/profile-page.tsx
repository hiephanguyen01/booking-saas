import { customerAccountSettingsInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Avatar, AvatarFallback, AvatarImage } from '@booking/ui/components/ui/avatar';
import { Button } from '@booking/ui/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { useOutletContext } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { AccountOutletContext } from '~/features/account/hooks/use-account-layout-controller';
import { userInitials } from '~/features/account/lib/account-nav';
import { AccountPanel } from '~/features/account/components/shared/account-primitives';
import { useAccountProfileController } from '~/features/account/hooks/use-account-profile-controller';
import type { handleAccountProfileAction } from '~/features/account/server/profile-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';

type AccountProfilePageProps = {
  actionData?: ServerDataFrom<typeof handleAccountProfileAction>;
};

export function AccountProfilePage({ actionData }: AccountProfilePageProps) {
  const { user } = useOutletContext<AccountOutletContext>();
  const { t } = useTranslation(NsI18n.Account);
  const { avatarSrc, choosePhoto, customerId, defaultValues, fields, inputRef, selectAvatar } =
    useAccountProfileController({
      user,
      labels: {
        fullName: t('profile.fullName'),
        email: t('profile.email'),
        phone: t('profile.phone'),
        currentPassword: t('profile.currentPassword'),
        newPassword: t('profile.newPassword'),
        confirmPassword: t('profile.confirmPassword'),
        placeholder: t('profile.placeholder'),
      },
    });

  return (
    <AccountPanel className="rounded-none px-6 py-8 sm:px-8 lg:px-10">
      <h1 className="text-lg font-semibold leading-7 text-foreground">{t('profile.title')}</h1>

      <div className="mt-6 flex items-center gap-4">
        <Avatar className="size-18">
          <AvatarImage src={avatarSrc} alt="" className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
            {userInitials(user.fullName)}
          </AvatarFallback>
        </Avatar>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => selectAvatar(event.currentTarget.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-sm border-foreground/75 px-4 text-xs font-semibold shadow-xs"
          onClick={choosePhoto}
        >
          {t('profile.choosePhoto')}
        </Button>
      </div>

      {actionData?.saved ? <SuccessNotice text={t('profile.saved')} /> : null}

      <GenericForm
        schema={customerAccountSettingsInputSchema}
        fields={fields}
        defaultValues={defaultValues}
        submitLabel={t('profile.save')}
        fieldErrors={actionData?.fieldErrors}
        renderFields={(renderedFields) => {
          const field = new Map(renderedFields.map((item) => [item.name, item.node]));
          return (
            <div>
              <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,375px)_minmax(0,375px)]">
                <CustomerIdField label={t('profile.customerId')} value={customerId} />
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
      className="mt-6 flex items-center gap-2 rounded-sm border border-success/15 bg-success/15 px-4 py-3 text-sm text-success"
    >
      <CheckCircle2 className="size-4" />
      {text}
    </div>
  );
}
