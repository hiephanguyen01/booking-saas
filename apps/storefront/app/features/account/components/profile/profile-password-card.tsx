import { customerPasswordChangeSchema } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { useMemo } from 'react';
import { passwordFormMessages } from '~/features/account/lib/profile-form-messages';
import { AccountPanel } from '~/features/account/components/shared/account-primitives';
import { ProfilePasswordRules } from '~/features/account/components/profile/profile-password-rules';
import {
  ProfileFormClassName,
  ProfileSuccessNotice,
} from '~/features/account/components/profile/profile-primitives';
import { useProfilePasswordController } from '~/features/account/hooks/use-profile-password-controller';
import type { ProfileActionData } from '~/features/account/server/profile-route.server';

/**
 * "Đổi mật khẩu" — its own card and its own submit. Kept separate from the
 * identity card because the two have different inputs, different failure modes
 * (a wrong current password) and different consequences (other devices are
 * signed out).
 */
export function ProfilePasswordCard({ result }: { result: ProfileActionData | null }) {
  const { t } = useTranslation(NsI18n.Account);
  const { defaultValues, fields } = useProfilePasswordController({
    labels: {
      currentPassword: t('profile.currentPassword'),
      newPassword: t('profile.newPassword'),
      confirmPassword: t('profile.confirmPassword'),
      placeholder: t('profile.placeholder'),
    },
  });
  const mine = result?.intent === 'password' ? result : null;
  // zod carries its messages inside the schema, so the schema is rebuilt with
  // the active locale's copy rather than shipping English validation errors.
  const schema = useMemo(() => customerPasswordChangeSchema(passwordFormMessages(t)), [t]);

  return (
    <AccountPanel className="mt-6 px-6 py-8 sm:px-8 lg:px-10">
      <h2 className="text-lg font-semibold leading-7 text-foreground">
        {t('profile.passwordTitle')}
      </h2>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        {t('profile.passwordDescription')}
      </p>

      {mine?.saved ? <ProfileSuccessNotice text={t('profile.passwordSaved')} /> : null}

      <GenericForm
        // Remounting on success clears the three password inputs; leaving the
        // old values in place after a successful change is both untidy and a
        // small shoulder-surfing risk.
        key={mine?.saved ? 'saved' : 'editing'}
        schema={schema}
        fields={fields}
        defaultValues={defaultValues}
        submitLabel={t('profile.savePassword')}
        submitPendingLabel={t('profile.saving')}
        serverError={mine?.error ?? null}
        fieldErrors={mine?.fieldErrors ?? null}
        transform={(values) => ({ ...values, intent: 'password' })}
        renderFields={(renderedFields, values) => (
          <div>
            <div className="grid max-w-[375px] gap-6">
              {renderedFields.map((field) => field.node)}
            </div>
            <ProfilePasswordRules
              password={values.newPassword}
              confirmPassword={values.confirmPassword}
            />
          </div>
        )}
        className={ProfileFormClassName}
      />
    </AccountPanel>
  );
}
