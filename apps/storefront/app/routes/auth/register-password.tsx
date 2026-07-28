import { useActionData, useOutletContext } from 'react-router';
import { AuthFrame, NewPasswordForm } from '~/features/auth/components';
import { completePasswordAction, requireFlowPhaseOnly } from '~/lib/auth-routes.server';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '~/lib/i18n';
import type { StorefrontContext } from '~/root';
import type { Route } from './+types/register-password';
export const meta = () => [
  { title: 'Create password' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export const loader = ({ request, params }: Route.LoaderArgs) =>
  requireFlowPhaseOnly(request, 'registration_password', `/${params.locale}/auth/register`);
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
