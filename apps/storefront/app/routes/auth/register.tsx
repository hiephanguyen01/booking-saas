import { Link, useActionData, useOutletContext } from 'react-router';
import { AuthFrame, SocialButtons, StartForm } from '~/features/auth/components';
import { startRegistrationAction } from '~/features/auth/server/auth-routes.server';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/constants/paths';
import type { StorefrontContext } from '~/root';
import type { Route } from './+types/register';
export const meta = ({ params }: Route.MetaArgs) => [
  { title: params.locale === 'en' ? 'Create account' : 'Đăng ký' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export const action = ({ request, params }: Route.ActionArgs) =>
  startRegistrationAction(request, params.locale);
export default function RegisterRoute() {
  const { tenant, locale } = useOutletContext<StorefrontContext>();
  const actionData = useActionData<AuthActionData>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AuthFrame
      tenant={tenant}
      title={t('register.title')}
      description={t('register.description')}
      split
    >
      <StartForm mode="register" locale={locale} actionData={actionData} />
      <SocialButtons />
      <p className="mt-7 text-center text-sm text-muted-foreground">
        {t('register.hasAccount')}{' '}
        <Link
          className="font-semibold text-primary hover:underline"
          to={storefrontPaths.login(locale)}
        >
          {t('register.login')}
        </Link>
      </p>
    </AuthFrame>
  );
}
