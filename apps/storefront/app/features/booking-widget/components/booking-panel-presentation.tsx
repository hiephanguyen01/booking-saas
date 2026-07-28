import type {
  AvailabilityMode,
  PublicListingDetailResponse,
  QuoteResponse,
} from '@booking/contracts';
import { Separator } from '@booking/ui/components/ui/separator';
import { cn } from '@booking/ui/lib/utils';
import type { ReactNode } from 'react';
import { minimumConfiguredPrice } from '~/lib/booking-presentation';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { hoursBetween } from '~/lib/time';
import { formatVnd } from '~/lib/ui';
import type { PublicPackageOption } from '~/lib/package-options';

export function PackagePicker({
  packages,
  selectedId,
  fallbackPhoto,
  onSelect,
}: {
  packages: PublicPackageOption[];
  selectedId: string | null;
  fallbackPhoto?: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);

  return (
    <div className="space-y-2">
      <PickerLabel>{t('packages.selectPackage')}</PickerLabel>
      <div className="grid gap-2">
        {packages.map((item) => {
          const durationLabel =
            item.mode === 'hourly'
              ? t('packages.durationMinutes', { count: item.duration })
              : t('packages.durationDays', { count: item.duration });
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                selectedId === item.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50',
              )}
            >
              <span className="flex items-center gap-3">
                {(item.photos[0] ?? fallbackPhoto) ? (
                  <img
                    src={item.photos[0] ?? fallbackPhoto}
                    alt=""
                    className="size-14 shrink-0 rounded-md object-cover"
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-3 font-medium">
                    <span>{item.name}</span>
                    <span>{formatVnd(item.price)}</span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {durationLabel}
                    {item.description ? ` · ${item.description}` : ''}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function QuoteHeader({
  quote,
  listing,
  mode,
  start,
  end,
  selectedDays,
}: {
  quote: QuoteResponse | null;
  listing: PublicListingDetailResponse;
  mode: AvailabilityMode;
  start: string | null;
  end: string | null;
  selectedDays: number | null;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const from = formatVnd(minimumConfiguredPrice(listing.modeConfig));
  const selectedHours = start && end ? hoursBetween(start, end) : null;
  const unitLabel: Record<AvailabilityMode, string> = {
    hourly: quote && selectedHours ? t('forHours', { count: selectedHours }) : t('perHour'),
    daily: quote && selectedDays ? t('forDays', { count: selectedDays }) : t('perDay'),
    inventory: t('perItem'),
  };

  return (
    <div className="text-right">
      {quote ? (
        <p className="text-sm text-muted-foreground">
          {t('subtotalEstimate')}{' '}
          <strong className="text-xl text-primary">{formatVnd(quote.subtotal)}</strong>
        </p>
      ) : from ? (
        <p className="text-sm text-muted-foreground">
          {t('fromPriceShort')} <strong className="text-xl text-primary">{from}</strong>
        </p>
      ) : (
        <p className="font-semibold text-foreground">{t('pickScheduleForPrice')}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{unitLabel[mode]}</p>
    </div>
  );
}

export function ModeToggle({
  modes,
  active,
  onSelect,
}: {
  modes: AvailabilityMode[];
  active: AvailabilityMode;
  onSelect: (mode: AvailabilityMode) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const label: Record<AvailabilityMode, string> = {
    hourly: t('modeHourly'),
    daily: t('modeDaily'),
    inventory: t('modeInventory'),
  };

  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1">
      {modes.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(item)}
          className={cn(
            'rounded-md px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            item === active
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label[item]}
        </button>
      ))}
    </div>
  );
}

export function Breakdown({ quote }: { quote: QuoteResponse }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <dl className="rounded-lg bg-muted/40 p-3 text-sm">
      {quote.lineItems.map((line, index) => (
        <div key={index} className="flex justify-between gap-3 py-0.5 text-muted-foreground">
          <dt>
            {line.label}
            {line.block ? ` (${t('package')})` : ''}
          </dt>
          <dd>{formatVnd(line.amount)}</dd>
        </div>
      ))}
      <Separator className="my-2.5" />
      <div className="flex justify-between gap-3 font-semibold text-foreground">
        <dt>{t('subtotal')}</dt>
        <dd>{formatVnd(quote.subtotal)}</dd>
      </div>
      <div className="mt-1 flex justify-between gap-3 text-muted-foreground">
        <dt>{t('deposit')}</dt>
        <dd>{formatVnd(quote.depositAmount)}</dd>
      </div>
      {quote.securityDeposit !== '0' ? (
        <div className="mt-1 flex justify-between gap-3 text-muted-foreground">
          <dt>{t('securityDeposit')}</dt>
          <dd>{formatVnd(quote.securityDeposit)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Not `@booking/ui`'s `FieldLabel`: these sit inside `<label>` wrappers, so this
 * renders a `<span>` rather than a nested `<label>`. */
export function PickerLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  );
}
