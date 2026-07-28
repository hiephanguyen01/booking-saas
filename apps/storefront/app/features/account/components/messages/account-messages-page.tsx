import {
  FeatureUnavailableState,
  PageHeading,
} from '~/features/account/components/shared/account-primitives';
import { NsI18n, useTranslation } from '~/lib/i18n';

export function AccountMessagesPage() {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <div className="space-y-4">
      <PageHeading title={t('messages.title')} />
      <FeatureUnavailableState />
    </div>
  );
}
