import { Link, useActionData, useOutletContext } from 'react-router';
import { authMeta } from '~/features/auth/lib/auth-meta';
import { AuthFrame } from '~/features/auth/components/auth-frame';
import { StartForm } from '~/features/auth/components/auth-start-form';
import { startResetAction } from '~/features/auth/server/auth-routes.server';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import type { StorefrontContext } from '~/root';
import type { Route } from './+types/forgot-password';
export const meta = ({ params }: Route.MetaArgs) => authMeta(params.locale, 'forgotPassword');
export const action = ({ request, params }: Route.ActionArgs) =>
  startResetAction(request, params.locale);
export default function RouteComponent() {
  const { tenant, locale } = useOutletContext<StorefrontContext>();
  const actionData = useActionData<AuthActionData>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame
      tenant={tenant}
      title={t('forgot.title')}
      description={t('forgot.description')}
      backTo={storefrontPaths.login(locale)}
    >
      <StartForm mode="reset" locale={locale} actionData={actionData} />
      <p className="mt-7 text-center">
        <Link
          className="text-sm font-semibold text-primary hover:underline"
          to={storefrontPaths.login(locale)}
        >
          {t('forgot.back')}
        </Link>
      </p>
    </AuthFrame>
  );
}
