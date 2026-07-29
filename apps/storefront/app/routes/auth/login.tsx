import { Link, useActionData, useOutletContext } from 'react-router';
import { authMeta } from '~/features/auth/lib/auth-meta';
import type { Route } from './+types/login';
import { AuthFrame } from '~/features/auth/components/auth-frame';
import { SocialButtons } from '~/features/auth/components/auth-social-buttons';
import { StartForm } from '~/features/auth/components/auth-start-form';
import { loginAction } from '~/features/auth/server/auth-routes.server';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import type { StorefrontContext } from '~/root';

export const meta = ({ params }: Route.MetaArgs) => authMeta(params.locale, 'login');
export const action = ({ request, params }: Route.ActionArgs) =>
  loginAction(request, params.locale);

export default function LoginRoute() {
  const { tenant, locale } = useOutletContext<StorefrontContext>();
  const actionData = useActionData<AuthActionData>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame tenant={tenant} title={t('login.title')} description={t('login.description')} split>
      <StartForm mode="login" locale={locale} actionData={actionData} />
      <SocialButtons />
      <p className="mt-7 text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link
          className="font-semibold text-primary hover:underline"
          to={storefrontPaths.register(locale)}
        >
          {t('login.register')}
        </Link>
      </p>
    </AuthFrame>
  );
}
