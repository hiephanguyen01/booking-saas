import { Outlet, useLocation, useOutletContext } from 'react-router';
import { AccountFlowLayout } from '../../layouts/account-flow-layout';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { StorefrontContext } from '../../root';

export const handle = { standalone: true };

export default function AuthLayout() {
  const context = useOutletContext<StorefrontContext>();
  const { t } = useTranslation(NsI18n.Auth);
  const pathname = useLocation().pathname;
  const section = pathname.includes('forgot-password')
    ? t('header.reset')
    : pathname.includes('register')
      ? t('header.register')
      : t('header.login');
  return (
    <AccountFlowLayout
      context={context}
      section={section}
      contentClassName="flex flex-1 items-center px-4 py-10 sm:px-6 sm:py-16"
    >
      <Outlet context={context} />
    </AccountFlowLayout>
  );
}
