import type {
  PublicListingDetailResponse,
  QuoteResponse,
  ValidatePromoResponse,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { CalendarDays, Check, MapPin } from 'lucide-react';
import { SectionCard } from '../../../components/section-card';
import { NsI18n, type ScopedI18n, useTranslation } from '../../../lib/i18n';
import { dateLabelInTz, DEFAULT_TZ, timeInTz } from '../../../lib/time';
import { formatListingLocation } from '../../../lib/ui';
import { useLocale } from '../../../lib/use-locale';
import type { checkoutAmounts, PolicyLine } from '../checkout-presentation';
import { PricePanel } from './price-panel';
import { PromoForm } from './promo-form';

export function BookingColumn({
  listing,
  mode,
  start,
  end,
  qty,
  policies,
  searchParams,
  promoCode,
  promo,
  quote,
  amounts,
}: {
  listing: PublicListingDetailResponse;
  mode: string;
  start: string;
  end: string;
  qty: string;
  policies: PolicyLine[];
  searchParams: URLSearchParams;
  promoCode: string | null;
  promo: ValidatePromoResponse | null;
  quote: QuoteResponse;
  amounts: ReturnType<typeof checkoutAmounts>;
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const { t: tListing } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const address = formatListingLocation(listing, 'full');
  const scheduleBadges = buildScheduleBadges(mode, start, end, qty, locale, tListing);
  const slotCount = mode === 'hourly' ? Math.max(1, scheduleBadges.length) : 1;

  return (
    <SectionCard>
      <div className="flex flex-col gap-1">
        <h2 className="text-base leading-6 font-semibold text-foreground">
          {listing.group?.title ?? listing.title}
        </h2>
        {address ? (
          <p className="flex items-center gap-2 text-xs leading-4 text-muted-foreground">
            <MapPin className="size-4.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
            <span>{address}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex gap-4">
        <div className="h-27.5 w-39 shrink-0 overflow-hidden rounded-sm bg-muted">
          {listing.photos[0] ? (
            <img
              src={listing.photos[0]}
              alt={listing.title}
              width={312}
              height={220}
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground">
              <CalendarDays className="size-7" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm leading-5 font-medium text-foreground">{listing.title}</h3>
          <p className="mt-3 flex items-center gap-1 text-xs leading-4 font-medium text-foreground">
            <CalendarDays className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
            {dateLabelInTz(start, DEFAULT_TZ, locale)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {scheduleBadges.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm leading-5 font-medium text-foreground">{t('policy.title')}</h3>
        <div className="mt-2 flex flex-col gap-2">
          {policies.map((policy, index) => {
            const text = policyText(policy, t);
            return (
              <p
                key={text}
                className={`flex items-start gap-2 text-sm leading-5 ${index === 0 ? 'text-primary' : 'text-foreground'}`}
              >
                <Check className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                <span>{text}</span>
              </p>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="max-w-47.5 text-sm leading-5 font-semibold text-foreground">
            {t('promotions')}
          </h3>
          <PromoForm searchParams={searchParams} promoCode={promoCode} promo={promo} />
        </div>
        <PricePanel
          quote={quote}
          promo={promo}
          amounts={amounts}
          qty={qty}
          mode={mode}
          slotCount={slotCount}
        />
      </div>
    </SectionCard>
  );
}

function policyText(line: PolicyLine, t: ScopedI18n<NsI18n.Checkout>['t']): string {
  if (line.kind === 'unspecified') return t('policy.unspecified');
  if (line.kind === 'noRefund') return t('policy.noRefund');
  return line.unit === 'day'
    ? t('policy.refundBeforeDays', { days: line.amount, percent: line.refundPercent })
    : t('policy.refundBeforeHours', { hours: line.amount, percent: line.refundPercent });
}

function buildScheduleBadges(
  mode: string,
  start: string,
  end: string,
  qty: string,
  locale: 'vi' | 'en',
  tListing: ScopedI18n<NsI18n.Listing>['t'],
): string[] {
  if (mode !== 'hourly') return [scheduleLabel(mode, start, end, qty, locale, tListing)];
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [scheduleLabel(mode, start, end, qty, locale, tListing)];
  }
  const durationHours = Math.max(1, Math.round((endMs - startMs) / 3_600_000));
  if (durationHours > 6 || (endMs - startMs) % 3_600_000 !== 0) {
    return [
      `${timeInTz(start, DEFAULT_TZ)} - ${timeInTz(end, DEFAULT_TZ)} (${tListing('hours', { count: durationHours })})`,
    ];
  }
  return Array.from({ length: durationHours }, (_, index) => {
    const slotStart = new Date(startMs + index * 3_600_000).toISOString();
    const slotEnd = new Date(startMs + (index + 1) * 3_600_000).toISOString();
    return `${timeInTz(slotStart, DEFAULT_TZ)} - ${timeInTz(slotEnd, DEFAULT_TZ)} (${tListing('hours', { count: 1 })})`;
  });
}

function scheduleLabel(
  mode: string,
  start: string,
  end: string,
  qty: string,
  locale: 'vi' | 'en',
  tListing: ScopedI18n<NsI18n.Listing>['t'],
): string {
  if (mode === 'daily') {
    return `${dateLabelInTz(start, DEFAULT_TZ, locale)} → ${dateLabelInTz(end, DEFAULT_TZ, locale)}`;
  }
  if (mode === 'inventory') {
    return `${dateLabelInTz(start, DEFAULT_TZ, locale)} → ${dateLabelInTz(end, DEFAULT_TZ, locale)} · ${tListing('quantity')}: ${qty}`;
  }
  return `${dateLabelInTz(start, DEFAULT_TZ, locale)} · ${timeInTz(start, DEFAULT_TZ)}–${timeInTz(end, DEFAULT_TZ)}`;
}
