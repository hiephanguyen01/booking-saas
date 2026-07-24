import { NsI18n, useTranslation } from '../../../lib/i18n';

export function SuspendedNotice({ name }: { name: string }) {
  const { t } = useTranslation(NsI18n.Error);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-3 bg-background p-8 text-center text-foreground">
      <h1 className="text-2xl font-semibold">{t('tenantSuspendedTitle', { tenant: name })}</h1>
      <p className="text-muted-foreground">{t('tenantSuspendedDescription')}</p>
    </main>
  );
}
