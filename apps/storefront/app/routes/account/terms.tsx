import { LegalPage } from '~/features/account/components/legal/legal-page';
import { NsI18n, useTranslation } from '~/lib/i18n';

export default function TermsPage() {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <LegalPage
      title={t('terms.title')}
      sections={[
        { body: t('terms.intro') },
        { title: t('terms.definitionTitle'), body: t('terms.definition') },
        { title: t('terms.bookingTitle'), body: t('terms.booking') },
        { title: t('terms.conductTitle'), body: t('terms.conduct') },
      ]}
    />
  );
}
