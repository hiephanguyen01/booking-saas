import { LegalPage } from '../../features/account/components/legal-page';
import { NsI18n, useTranslation } from '../../lib/i18n';

export default function SecurityPage() {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <LegalPage
      title={t('security.title')}
      sections={[
        { body: t('security.intro') },
        { title: t('security.accountTitle'), body: t('security.account') },
        { title: t('security.privacyTitle'), body: t('security.privacy') },
        { title: t('security.safetyTitle'), body: t('security.safety') },
      ]}
    />
  );
}
