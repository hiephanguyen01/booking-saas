import type {
  PublicListingDetailWithTimezoneResponse,
  QuoteResponse,
  StorefrontPromotion,
  ValidatePromoResponse,
} from '@booking/contracts';
import { formatCurrency } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';
import { Badge } from '@booking/ui/components/ui/badge';
import { CalendarDays, Check, MapPin } from 'lucide-react';
import { SectionCard } from '~/components/section-card';
import { cancellationLineTexts, type CancellationPolicyLine } from '~/lib/cancellation-policy';
import { NsI18n, type ScopedI18n, useTranslation } from '@booking/i18n';
import { dateLabelInTz, dateOnlyInTz, hoursBetween, nightsBetween, timeInTz } from '~/lib/time';
import { formatListingLocation } from '~/lib/ui';
import { useLocale } from '~/hooks/use-locale';
import type { checkoutAmounts } from '~/features/checkout/lib/checkout-presentation';
import { PricePanel } from './price-panel';
import { PromoForm } from './promo-form';

export function BookingColumn({
  listing,
  mode,
  start,
  end,
  qty,
  policyLines,
  searchParams,
  promoCode,
  promo,
  availablePromotions,
  promotionsUnavailable,
  quote,
  amounts,
}: {
  listing: PublicListingDetailWithTimezoneResponse;
  mode: string;
  start: string;
  end: string;
  qty: string;
  policyLines: CancellationPolicyLine[] | null;
  searchParams: URLSearchParams;
  promoCode: string | null;
  promo: ValidatePromoResponse | null;
  availablePromotions: StorefrontPromotion[];
  promotionsUnavailable: boolean;
  quote: QuoteResponse;
  amounts: ReturnType<typeof checkoutAmounts>;
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const { t: tListing } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const address = formatListingLocation(listing, 'full');
  const scheduleBadges = buildScheduleBadges(
    mode,
    start,
    end,
    qty,
    locale,
    listing.timezone,
    tListing,
  );
  const slotCount = mode === 'hourly' ? hourlySlotCount(start, end) : 1;
  const dayCount =
    mode === 'daily'
      ? Math.max(
          1,
          nightsBetween(dateOnlyInTz(start, listing.timezone), dateOnlyInTz(end, listing.timezone)),
        )
      : 1;
  const packagePhotos = quote.selectedPackage?.photos ?? [];
  const coverPhoto = packagePhotos[0] ?? listing.photos[0];

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

      {/* Side by side, a fixed 156px thumbnail leaves ~110px for the title and
          the schedule badges — narrower than one badge, so they spilled out.
          Below 400px the photo becomes a full-width cover and the summary gets
          the whole column. */}
      <div className="mt-3 flex flex-col gap-3 min-[400px]:flex-row min-[400px]:gap-4">
        <div className="h-32 w-full shrink-0 overflow-hidden rounded-(--sf-image-radius) bg-muted min-[400px]:h-27.5 min-[400px]:w-39 md:rounded-sm">
          {coverPhoto ? (
            <Image
              src={coverPhoto}
              alt={quote.selectedPackage?.name ?? listing.title}
              width={312}
              height={220}
              loading="eager"
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
            {dateLabelInTz(start, listing.timezone, locale)}
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

      {quote.selectedPackage ? (
        <div className="mt-4 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm font-semibold">{quote.selectedPackage.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {'durationMinutes' in quote.selectedPackage
              ? tListing('packages.durationMinutes', {
                  count: quote.selectedPackage.durationMinutes,
                })
              : tListing('packages.durationDays', { count: quote.selectedPackage.durationDays })}
            {quote.selectedPackage.description ? ` · ${quote.selectedPackage.description}` : ''}
          </p>
          {packagePhotos.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {packagePhotos.map((photo) => (
                <Image
                  key={photo}
                  src={photo}
                  alt=""
                  className="h-14 w-20 shrink-0 rounded-(--sf-image-radius) object-cover md:rounded-md"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">
        <h3 className="text-sm leading-5 font-medium text-foreground">{t('policy.title')}</h3>
        <div className="mt-2 flex flex-col gap-2">
          {policyLines === null ? (
            <p className="flex items-start gap-2 text-sm leading-5 text-foreground">
              <Check className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
              <span>{t('policy.unspecified')}</span>
            </p>
          ) : (
            cancellationLineTexts(
              policyLines,
              locale,
              listing.timezone,
              {
                cutoffDate: (parts) => t('policy.cutoffDate', parts),
                free: (vars) => t('policy.freeCancellationUntil', vars),
                late: (vars) => t('policy.lateCancellationFrom', vars),
              },
              (feeAmount) => formatCurrency(BigInt(feeAmount), 'VND', locale),
            ).map((line) => (
              <p
                key={line.text}
                className={`flex items-start gap-2 text-sm leading-5 ${line.isFree ? 'text-success' : 'text-foreground'}`}
              >
                <Check className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                <span>{line.text}</span>
              </p>
            ))
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="max-w-47.5 text-sm leading-5 font-semibold text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
            {t('promotions')}
          </h3>
          <PromoForm
            searchParams={searchParams}
            promoCode={promoCode}
            promo={promo}
            promotions={availablePromotions}
            promotionsUnavailable={promotionsUnavailable}
          />
        </div>
        <PricePanel
          quote={quote}
          promo={promo}
          amounts={amounts}
          qty={qty}
          mode={mode}
          slotCount={slotCount}
          dayCount={dayCount}
        />
      </div>
    </SectionCard>
  );
}

/** At least one slot: an unparseable or inverted interval still shows a single row. */
function hourlySlotCount(start: string, end: string): number {
  return Math.max(1, Math.round(hoursBetween(start, end) ?? 1));
}

function buildScheduleBadges(
  mode: string,
  start: string,
  end: string,
  qty: string,
  locale: 'vi' | 'en',
  timeZone: string,
  tListing: ScopedI18n<NsI18n.Listing>['t'],
): string[] {
  if (mode !== 'hourly') {
    return [scheduleLabel(mode, start, end, qty, locale, timeZone, tListing)];
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [scheduleLabel(mode, start, end, qty, locale, timeZone, tListing)];
  }
  const durationHours = hourlySlotCount(start, end);
  if (durationHours > 6 || (endMs - startMs) % 3_600_000 !== 0) {
    return [
      `${timeInTz(start, timeZone)} - ${timeInTz(end, timeZone)} (${tListing('hours', { count: durationHours })})`,
    ];
  }
  return Array.from({ length: durationHours }, (_, index) => {
    const slotStart = new Date(startMs + index * 3_600_000).toISOString();
    const slotEnd = new Date(startMs + (index + 1) * 3_600_000).toISOString();
    return `${timeInTz(slotStart, timeZone)} - ${timeInTz(slotEnd, timeZone)} (${tListing('hours', { count: 1 })})`;
  });
}

function scheduleLabel(
  mode: string,
  start: string,
  end: string,
  qty: string,
  locale: 'vi' | 'en',
  timeZone: string,
  tListing: ScopedI18n<NsI18n.Listing>['t'],
): string {
  if (mode === 'daily') {
    return `${dateLabelInTz(start, timeZone, locale)} → ${dateLabelInTz(end, timeZone, locale)}`;
  }
  if (mode === 'inventory') {
    return `${dateLabelInTz(start, timeZone, locale)} → ${dateLabelInTz(end, timeZone, locale)} · ${tListing('quantity')}: ${qty}`;
  }
  return `${dateLabelInTz(start, timeZone, locale)} · ${timeInTz(start, timeZone)}–${timeInTz(end, timeZone)}`;
}
