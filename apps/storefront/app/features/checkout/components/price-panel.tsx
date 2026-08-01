import type { QuoteResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { NsI18n, useTranslation } from '@booking/i18n';
import { formatVnd } from '~/lib/ui';
import { campaignLabelsOf } from '~/lib/quote';
import type {
  CheckoutPromotionPresentation,
  checkoutAmounts,
} from '~/features/checkout/lib/checkout-presentation';

export function PricePanel({
  quote,
  checkoutPromotion,
  amounts,
  qty,
  mode,
  slotCount,
  dayCount,
}: {
  quote: QuoteResponse;
  checkoutPromotion: CheckoutPromotionPresentation | null;
  amounts: ReturnType<typeof checkoutAmounts>;
  qty: string;
  mode: string;
  slotCount: number;
  dayCount: number;
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const { t: tListing } = useTranslation(NsI18n.Listing);
  const hasDiscount = amounts.discount !== '0';
  const quantity = mode === 'inventory' ? qty : '1';
  const quantityLabel =
    mode === 'daily'
      ? t('dailyQuantityLine', { rooms: quantity, days: dayCount })
      : mode === 'inventory'
        ? t('inventoryQuantityLine', { quantity })
        : t('quantityLine', { rooms: quantity, slots: slotCount });
  const hasCalendarSale = quote.regularSubtotal !== quote.subtotal;
  const calendarSavings = hasCalendarSale
    ? (BigInt(quote.regularSubtotal) - BigInt(quote.subtotal)).toString()
    : '0';
  // Partner-authored, already in the tenant's language — shown verbatim, never
  // translated. Several campaigns can price one booking, so render the
  // distinct labels independently rather than picking or merging one.
  const campaigns = campaignLabelsOf(quote);

  return (
    <div className="mt-3 rounded-lg bg-muted/40 px-5 py-4 text-sm leading-5 text-foreground">
      <PriceRow
        label={quantityLabel}
        value={formatVnd(hasCalendarSale ? quote.regularSubtotal : amounts.subtotal)}
      />
      {hasCalendarSale ? (
        <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
          <PriceRow
            label={t('calendarSalePrice')}
            value={`− ${formatVnd(calendarSavings)}`}
            className="font-semibold text-warning-foreground"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(campaigns.length > 0 ? campaigns : [t('saleBadge')]).map((campaign) => (
              <Badge
                key={campaign}
                variant="outline"
                className="max-w-full rounded-sm border-warning/50 bg-background/70 text-warning-foreground"
              >
                <span className="min-w-0 truncate">{campaign}</span>
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {checkoutPromotion?.kind === 'auto' ? (
        <div className="mt-2 rounded-md border border-success/30 bg-success/10 px-3 py-2.5">
          <Badge variant="success" className="max-w-full rounded-sm font-semibold">
            <span className="min-w-0 truncate">
              {t('automaticPromotion', { name: checkoutPromotion.label })}
            </span>
          </Badge>
          <p className="mt-2 text-xs leading-4 text-success">
            {t('automaticPromotionConditional')}
          </p>
        </div>
      ) : null}
      {hasDiscount && checkoutPromotion?.kind === 'code' ? (
        <div className="mt-2 rounded-md border border-success/30 bg-success/10 px-3 py-2.5">
          <PriceRow
            label={t('checkoutPromotion')}
            value={`− ${formatVnd(amounts.discount)}`}
            className="font-semibold text-success"
          />
          <Badge variant="success" className="mt-2 max-w-full rounded-sm font-semibold">
            <span className="min-w-0 truncate">{checkoutPromotion.label}</span>
          </Badge>
        </div>
      ) : null}
      {quote.securityDeposit !== '0' ? (
        <PriceRow
          label={tListing('securityDeposit')}
          value={formatVnd(quote.securityDeposit)}
          className="mt-2"
        />
      ) : null}
      <PriceRow
        label={t('total')}
        value={formatVnd(amounts.finalAmount)}
        className="mt-2 text-base leading-6 font-semibold"
      />
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{t('totalIncludes')}</p>
    </div>
  );
}

function PriceRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', className)}>
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 text-right font-medium">{value}</span>
    </div>
  );
}
