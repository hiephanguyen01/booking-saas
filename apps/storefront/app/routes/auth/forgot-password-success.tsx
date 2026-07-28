import { useOutletContext } from 'react-router';
import { AuthFrame, SuccessState } from '~/features/auth/components';
import { requireFlowPhaseOnly } from '~/features/auth/server/auth-routes.server';
import { NsI18n, useTranslation } from '~/lib/i18n';
import type { StorefrontContext } from '~/root';
import type { Route } from './+types/forgot-password-success';
export const meta = ({ params }: Route.MetaArgs) => [
  { title: params.locale === 'en' ? 'Password changed' : 'Đổi mật khẩu thành công' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export const loader = ({ request, params }: Route.LoaderArgs) =>
  requireFlowPhaseOnly(request, 'reset_success', `/${params.locale}/auth/forgot-password`);
export default function RouteComponent() {
  const { tenant, locale } = useOutletContext<StorefrontContext>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame
      tenant={tenant}
      title={t('success.resetTitle')}
      description={t('success.resetDescription')}
    >
      <SuccessState mode="reset" locale={locale} />
    </AuthFrame>
  );
}
