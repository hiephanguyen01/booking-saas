import { Outlet, useOutletContext } from 'react-router';
import { AccountFlowLayout } from '../../layouts/account-flow-layout';
import type { StorefrontContext } from '../../root';

export const handle = { standalone: true };

export default function PartnerOnboardingLayout() {
  const context = useOutletContext<StorefrontContext>();
  return (
    <AccountFlowLayout
      context={context}
      section="Đăng ký đối tác"
      contentAs="div"
      contentClassName="flex flex-1 flex-col py-10 sm:py-16"
    >
      <Outlet context={context} />
    </AccountFlowLayout>
  );
}
