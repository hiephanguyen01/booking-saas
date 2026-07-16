import type { QuoteResponse, ValidatePromoResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { formatVnd } from '../../../lib/ui';
import type { checkoutAmounts } from '../checkout-presentation';

export function PricePanel({
  quote,
  promo,
  amounts,
  qty,
  mode,
  slotCount,
}: {
  quote: QuoteResponse;
  promo: ValidatePromoResponse | null;
  amounts: ReturnType<typeof checkoutAmounts>;
  qty: string;
  mode: string;
  slotCount: number;
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const { t: tListing } = useTranslation(NsI18n.Listing);
  const hasDiscount = amounts.discount !== '0';
  const quantity = mode === 'inventory' ? qty : '1';

  return (
    <div className="mt-3 rounded-lg bg-primary/10 px-5 py-4 text-sm leading-5 text-foreground">
      {hasDiscount ? (
        <div className="flex items-center justify-between gap-4">
          <Badge variant="destructive" className="rounded-sm font-semibold">
            {promo?.code ?? t('discount')}
          </Badge>
          <span className="text-muted-foreground line-through">{formatVnd(amounts.subtotal)}</span>
        </div>
      ) : null}
      <PriceRow
        label={t('quantityLine', { rooms: quantity, slots: slotCount })}
        value={formatVnd(amounts.subtotal)}
        className={hasDiscount ? 'mt-2' : ''}
      />
      <PriceRow label={t('discount')} value={`− ${formatVnd(amounts.discount)}`} className="mt-2" />
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
      <span>{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
