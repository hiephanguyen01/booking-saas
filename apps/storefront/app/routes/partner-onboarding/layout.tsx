import { Outlet, useOutletContext } from 'react-router';
import { AccountFlowLayout } from '~/features/account/components/account-flow/account-flow-layout';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { StorefrontContext } from '~/root';

export const handle = { standalone: true };

export default function PartnerOnboardingLayout() {
  const context = useOutletContext<StorefrontContext>();
  const { t } = useTranslation(NsI18n.Auth);
  return (
    <AccountFlowLayout
      context={context}
      section={t('partner.section')}
      contentAs="div"
      contentClassName="flex flex-1 flex-col py-10 sm:py-16"
    >
      <Outlet context={context} />
    </AccountFlowLayout>
  );
}
