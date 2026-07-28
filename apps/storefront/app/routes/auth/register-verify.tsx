import { useActionData, useLoaderData, useOutletContext } from 'react-router';
import type { Route } from './+types/register-verify';
import { AuthFrame } from '~/features/auth/components/auth-frame';
import { OtpForm } from '~/features/auth/components/auth-otp-form';
import { requireFlowView, verifyAction } from '~/features/auth/server/auth-routes.server';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '~/lib/i18n';
import type { StorefrontContext } from '~/root';
export const meta = ({ params }: Route.MetaArgs) => [
  { title: params.locale === 'en' ? 'Verify email' : 'Xác thực email' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export const loader = ({ request, params }: Route.LoaderArgs) =>
  requireFlowView(request, 'registration_verify', `/${params.locale}/auth/register`);
export const action = ({ request, params }: Route.ActionArgs) =>
  verifyAction(request, params.locale, 'registration');
export default function RouteComponent() {
  const { tenant } = useOutletContext<StorefrontContext>();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<AuthActionData & { resendAfterSec?: number }>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame
      tenant={tenant}
      title={t('verify.registrationTitle')}
      description={t('verify.description', { email: loaderData.maskedDestination ?? '' })}
    >
      <OtpForm initialSeconds={loaderData.resendAfterSec} actionData={actionData} />
    </AuthFrame>
  );
}
