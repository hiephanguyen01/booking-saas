import { Badge } from '@booking/ui/components/ui/badge';
import { Camera, Construction } from 'lucide-react';
import { NsI18n, useTranslation } from '../../../lib/i18n';

export function AccountPanel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-sm bg-background shadow-[0_8px_28px_rgba(16,24,40,0.05)] ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeading({
  title,
  demo = false,
  action,
}: {
  title: string;
  demo?: boolean;
  action?: React.ReactNode;
}) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <div className="flex min-h-13 flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold leading-7 text-foreground">{title}</h1>
        {demo ? (
          <Badge variant="secondary" className="font-medium">
            {t('demo')}
          </Badge>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function DemoNotice() {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <p className="mb-4 rounded-sm border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
      {t('demoDescription')}
    </p>
  );
}

export function StudioThumbnail({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      className={`relative flex overflow-hidden bg-[linear-gradient(135deg,var(--muted),var(--background)_48%,color-mix(in_oklab,var(--primary)_14%,var(--muted)))] ${className}`}
    >
      <div className="absolute -right-6 -top-7 size-24 rounded-full border border-primary/15 bg-primary/5" />
      <div className="absolute -bottom-8 -left-5 size-24 rounded-full bg-foreground/5" />
      <Camera aria-hidden="true" className="m-auto size-7 text-primary/55" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function MockDisabledState() {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <AccountPanel className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
      <Construction className="size-10 text-primary" />
      <p className="text-sm text-muted-foreground">{t('mockDisabled')}</p>
    </AccountPanel>
  );
}
