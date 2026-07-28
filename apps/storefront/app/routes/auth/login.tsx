import { Link, useActionData, useOutletContext } from 'react-router';
import type { Route } from './+types/login';
import { AuthFrame, SocialButtons, StartForm } from '~/features/auth/auth-ui';
import { loginAction } from '~/lib/auth-routes.server';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/lib/locale-paths';
import type { StorefrontContext } from '~/root';

export const meta = ({ params }: Route.MetaArgs) => [
  { title: params.locale === 'en' ? 'Log in' : 'Đăng nhập' },
  { name: 'robots', content: 'noindex,nofollow' },
];
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
