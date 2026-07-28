import { Link } from 'react-router';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '@booking/i18n';

const LINK_CLASS =
  'min-h-5 rounded-sm text-sm leading-5 font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

export function MemberBanner({
  tenantName,
  loginHref,
  registerHref,
}: {
  tenantName: string;
  loginHref: string;
  registerHref: string;
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  return (
    <SectionCard>
      <p className="max-w-132.5 text-sm leading-5 text-foreground">
        {t('memberPitch', { tenant: tenantName })}
      </p>
      <div className="mt-4 flex items-center gap-10 sm:gap-14">
        <Link to={loginHref} className={LINK_CLASS}>
          {t('login')}
        </Link>
        <Link to={registerHref} className={LINK_CLASS}>
          {t('register')}
        </Link>
      </div>
    </SectionCard>
  );
}
