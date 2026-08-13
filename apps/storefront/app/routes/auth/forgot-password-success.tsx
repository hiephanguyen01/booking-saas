import { useOutletContext } from 'react-router';
import { authMeta } from '~/features/auth/lib/auth-meta';
import { AuthFrame } from '~/features/auth/components/auth-frame';
import { SuccessState } from '~/features/auth/components/auth-success-state';
import { requireFlowPhaseOnly } from '~/features/auth/server/auth-routes.server';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { StorefrontContext } from '~/root';
import type { Route } from './+types/forgot-password-success';
export const meta = ({ params }: Route.MetaArgs) =>
  authMeta(params.locale, 'forgotPasswordSuccess');
export const loader = ({ request, params }: Route.LoaderArgs) =>
  requireFlowPhaseOnly(request, 'password_reset', 'success', params.locale);
export default function RouteComponent() {
  const { tenant, locale } = useOutletContext<StorefrontContext>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame
      tenant={tenant}
      title={t('success.resetTitle')}
      description={t('success.resetDescription')}
      hideHeadingBelowMd
    >
      <SuccessState
        mode="reset"
        locale={locale}
        title={t('success.resetTitle')}
        description={t('success.resetDescription')}
      />
    </AuthFrame>
  );
}
