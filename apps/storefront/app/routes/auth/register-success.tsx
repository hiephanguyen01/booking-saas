import { useOutletContext } from 'react-router';
import type { Route } from './+types/register-success';
import { AuthFrame } from '~/features/auth/components/auth-frame';
import { SuccessState } from '~/features/auth/components/auth-success-state';
import { requireFlowPhaseOnly } from '~/features/auth/server/auth-routes.server';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { StorefrontContext } from '~/root';
export const meta = ({ params }: Route.MetaArgs) => [
  { title: params.locale === 'en' ? 'Account created' : 'Đăng ký thành công' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export const loader = ({ request, params }: Route.LoaderArgs) =>
  requireFlowPhaseOnly(request, 'registration_success', `/${params.locale}/auth/register`);
export default function RouteComponent() {
  const { tenant, locale } = useOutletContext<StorefrontContext>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame
      tenant={tenant}
      title={t('success.registrationTitle')}
      description={t('success.registrationDescription')}
    >
      <SuccessState mode="registration" locale={locale} />
    </AuthFrame>
  );
}
