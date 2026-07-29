import { useActionData, useOutletContext } from 'react-router';
import { authMeta } from '~/features/auth/lib/auth-meta';
import { AuthFrame } from '~/features/auth/components/auth-frame';
import { NewPasswordForm } from '~/features/auth/components/auth-new-password-form';
import {
  completePasswordAction,
  requireFlowPhaseOnly,
} from '~/features/auth/server/auth-routes.server';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { StorefrontContext } from '~/root';
import type { Route } from './+types/register-password';
export const meta = ({ params }: Route.MetaArgs) => authMeta(params.locale, 'registerPassword');
export const loader = ({ request, params }: Route.LoaderArgs) =>
  requireFlowPhaseOnly(request, 'registration', 'password', params.locale);
export const action = ({ request, params }: Route.ActionArgs) =>
  completePasswordAction(request, params.locale, 'registration');

export default function RouteComponent() {
  const { tenant } = useOutletContext<StorefrontContext>();
  const actionData = useActionData<AuthActionData>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame
      tenant={tenant}
      title={t('password.registrationTitle')}
      description={t('password.description')}
    >
      <NewPasswordForm mode="registration" actionData={actionData} />
    </AuthFrame>
  );
}
