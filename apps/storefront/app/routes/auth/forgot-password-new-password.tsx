import { useActionData, useOutletContext } from 'react-router';
import type { Route } from './+types/forgot-password-new-password';
import { AuthFrame, NewPasswordForm } from '../../features/auth/auth-ui';
import { completePasswordAction, requireFlowPhaseOnly } from '../../lib/auth-routes.server';
import type { AuthActionData } from '../../lib/auth-types';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { StorefrontContext } from '../../root';
export const meta = ({ params }: Route.MetaArgs) => [
  { title: params.locale === 'en' ? 'New password' : 'Mật khẩu mới' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export const loader = ({ request, params }: Route.LoaderArgs) =>
  requireFlowPhaseOnly(request, 'reset_password', `/${params.locale}/auth/forgot-password`);
export const action = ({ request, params }: Route.ActionArgs) =>
  completePasswordAction(request, params.locale, 'password_reset');
export default function RouteComponent() {
  const { tenant } = useOutletContext<StorefrontContext>();
  const actionData = useActionData<AuthActionData>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame
      tenant={tenant}
      title={t('password.resetTitle')}
      description={t('password.description')}
    >
      <NewPasswordForm mode="reset" actionData={actionData} />
    </AuthFrame>
  );
}
