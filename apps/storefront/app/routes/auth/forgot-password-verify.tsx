import { useActionData, useLoaderData, useOutletContext } from 'react-router';
import type { Route } from './+types/forgot-password-verify';
import { AuthFrame, OtpForm } from '../../features/auth/auth-ui';
import { requireFlowView, verifyAction } from '../../lib/auth-routes.server';
import type { AuthActionData } from '../../lib/auth-types';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { StorefrontContext } from '../../root';
export const meta = ({ params }: Route.MetaArgs) => [
  { title: params.locale === 'en' ? 'Verify reset code' : 'Xác thực mã đặt lại' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export const loader = ({ request, params }: Route.LoaderArgs) =>
  requireFlowView(request, 'reset_verify', `/${params.locale}/auth/forgot-password`);
export const action = ({ request, params }: Route.ActionArgs) =>
  verifyAction(request, params.locale, 'password_reset');
export default function RouteComponent() {
  const { tenant } = useOutletContext<StorefrontContext>();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<AuthActionData & { resendAfterSec?: number }>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame
      tenant={tenant}
      title={t('verify.resetTitle')}
      description={t('verify.description', { email: loaderData.maskedDestination ?? '' })}
    >
      <OtpForm initialSeconds={loaderData.resendAfterSec} actionData={actionData} />
    </AuthFrame>
  );
}
