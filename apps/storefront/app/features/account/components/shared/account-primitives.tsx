import { formatCurrency, type Locale } from '@booking/i18n';
import { Camera, Check, Construction, type LucideIcon } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';
import {
  cancellationPolicyLines,
  type AccountBookingViewModel,
} from '~/features/account/lib/booking-history';
import { cancellationLineTexts } from '~/lib/cancellation-policy';

export function AccountPanel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-sm bg-background shadow-(--sf-surface-shadow) ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-13 flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold leading-7 text-foreground">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function ListingThumbnail({ label, className = '' }: { label: string; className?: string }) {
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

export function CancellationPolicyList({
  booking,
  locale,
}: {
  booking: Pick<
    AccountBookingViewModel,
    'startUtc' | 'depositAmount' | 'cancellationTiers' | 'resourceTimezone'
  >;
  locale: Locale;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const lines = cancellationLineTexts(
    cancellationPolicyLines(booking),
    locale,
    booking.resourceTimezone,
    {
      cutoffDate: (parts) => t('bookings.policy.cutoffDate', parts),
      free: (vars) => t('bookings.policy.freeCancellationUntil', vars),
      late: (vars) => t('bookings.policy.lateCancellationFrom', vars),
    },
    (feeAmount) => formatCurrency(BigInt(feeAmount), 'VND', locale),
  );
  if (!lines.length) return null;

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {lines.map((line, index) => (
        <p
          key={index}
          className={`flex items-center gap-1.5 ${line.isFree ? 'text-success' : ''}`}
        >
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
          {line.text}
        </p>
      ))}
    </div>
  );
}

/** The listing-type tab strip above the account's favourites and recent lists. */
export function AccountTypeTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: Array<{ key: string; label: string; active: boolean; onSelect: () => void }>;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex min-h-13 w-full overflow-x-auto bg-background shadow-(--sf-surface-shadow) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.active}
          onClick={tab.onSelect}
          className={`relative shrink-0 px-6 py-4 text-sm font-semibold leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
            tab.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
          {tab.active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" /> : null}
        </button>
      ))}
    </div>
  );
}

/** The empty/error panel both account lists fall back to. `tone` picks the icon badge. */
export function AccountListState({
  icon: Icon,
  tone = 'primary',
  message,
  action,
}: {
  icon: LucideIcon;
  tone?: 'primary' | 'destructive';
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <AccountPanel className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
      <span
        className={`flex size-12 items-center justify-center rounded-full ${
          tone === 'destructive'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-primary/10 text-primary'
        }`}
      >
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </AccountPanel>
  );
}

export function FeatureUnavailableState() {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <AccountPanel className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
      <Construction className="size-10 text-primary" />
      <p className="text-sm text-muted-foreground">{t('featureUnavailable')}</p>
    </AccountPanel>
  );
}
