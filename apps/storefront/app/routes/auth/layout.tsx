import { Outlet, useLocation, useOutletContext } from 'react-router';
import { AccountFlowLayout } from '~/features/account/components/account-flow/account-flow-layout';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { StorefrontContext } from '~/root';

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
      contentClassName="flex flex-1 items-start px-0 py-0 md:items-center md:px-4 md:py-10 lg:px-6 lg:py-16"
      hideHeaderBelowMd
    >
      <Outlet context={context} />
    </AccountFlowLayout>
  );
}
