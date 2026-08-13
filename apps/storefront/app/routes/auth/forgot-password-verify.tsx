import { useActionData, useLoaderData, useOutletContext } from 'react-router';
import { authMeta } from '~/features/auth/lib/auth-meta';
import type { Route } from './+types/forgot-password-verify';
import { AuthFrame } from '~/features/auth/components/auth-frame';
import { OtpForm } from '~/features/auth/components/auth-otp-form';
import { requireFlowView, verifyAction } from '~/features/auth/server/auth-routes.server';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { StorefrontContext } from '~/root';
import { storefrontPaths } from '~/constants/paths';
export const meta = ({ params }: Route.MetaArgs) => authMeta(params.locale, 'forgotPasswordVerify');
export const loader = ({ request, params }: Route.LoaderArgs) =>
  requireFlowView(request, 'password_reset', 'verify', params.locale);
export const action = ({ request, params }: Route.ActionArgs) =>
  verifyAction(request, params.locale, 'password_reset');
export default function RouteComponent() {
  const { tenant, locale } = useOutletContext<StorefrontContext>();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<AuthActionData & { resendAfterSec?: number }>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame
      tenant={tenant}
      title={t('verify.resetTitle')}
      description={t('verify.description', { email: loaderData.maskedDestination ?? '' })}
      backTo={storefrontPaths.forgotPassword(locale)}
    >
      <OtpForm initialSeconds={loaderData.resendAfterSec} actionData={actionData} />
    </AuthFrame>
  );
}
