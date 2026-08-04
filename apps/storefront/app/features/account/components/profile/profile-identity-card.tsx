import { customerProfileFormSchema, type CurrentUser } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { useMemo } from 'react';
import { profileFormMessages } from '~/features/account/lib/profile-form-messages';
import { AccountPanel } from '~/features/account/components/shared/account-primitives';
import { ProfileAvatarPicker } from '~/features/account/components/profile/profile-avatar-picker';
import {
  ProfileFormClassName,
  ProfileReadOnlyField,
  ProfileSuccessNotice,
} from '~/features/account/components/profile/profile-primitives';
import { useProfileIdentityController } from '~/features/account/hooks/use-profile-identity-controller';
import type { ProfileActionData } from '~/features/account/server/profile-route.server';

/**
 * "Thông tin cá nhân" — photo, name and phone, saved on their own. Split out of
 * the old single form so that editing a name no longer forces the customer to
 * also fill in a password change.
 */
export function ProfileIdentityCard({
  user,
  result,
}: {
  user: CurrentUser;
  result: ProfileActionData | null;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const { customerId, defaultValues, fields } = useProfileIdentityController({
    user,
    labels: {
      fullName: t('profile.fullName'),
      phone: t('profile.phone'),
      placeholder: t('profile.placeholder'),
    },
  });
  const mine = result?.intent === 'identity' ? result : null;
  // zod carries its messages inside the schema, so the schema is rebuilt with
  // the active locale's copy rather than shipping English validation errors.
  const schema = useMemo(() => customerProfileFormSchema(profileFormMessages(t)), [t]);

  return (
    <AccountPanel className="px-6 py-8 sm:px-8 lg:px-10">
      <h1 className="text-lg font-semibold leading-7 text-foreground">{t('profile.title')}</h1>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        {t('profile.identityDescription')}
      </p>

      {mine?.saved ? <ProfileSuccessNotice text={t('profile.identitySaved')} /> : null}

      <GenericForm
        schema={schema}
        fields={fields}
        defaultValues={defaultValues}
        submitLabel={t('profile.save')}
        submitPendingLabel={t('profile.saving')}
        serverError={mine?.error ?? null}
        fieldErrors={mine?.fieldErrors ?? null}
        // A blank phone means "remove it"; `null` is what the API reads as a clear.
        transform={(values) => ({
          fullName: values.fullName,
          phone: values.phone ? values.phone : null,
          avatarUrl: values.avatarUrl,
          intent: 'identity',
        })}
        renderFields={(renderedFields, values, form) => {
          const field = new Map(renderedFields.map((item) => [item.name, item.node]));
          return (
            <div>
              <ProfileAvatarPicker
                fullName={values.fullName || user.fullName}
                value={values.avatarUrl}
                onChange={(next) =>
                  form.setValue('avatarUrl', next, { shouldDirty: true, shouldValidate: true })
                }
              />

              <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,375px)_minmax(0,375px)]">
                <ProfileReadOnlyField label={t('profile.customerId')} value={customerId} />
                {field.get('fullName')}
                <ProfileReadOnlyField
                  label={t('profile.email')}
                  value={user.email}
                  hint={t('profile.emailLocked')}
                />
                {field.get('phone')}
              </div>
            </div>
          );
        }}
        className={ProfileFormClassName}
      />
    </AccountPanel>
  );
}
