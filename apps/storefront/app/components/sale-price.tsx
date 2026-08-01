import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import { discountPercent } from '~/lib/sale-campaign';
import { formatVnd } from '~/lib/ui';

export function SalePrice({
  price,
  regularPrice,
  campaignLabel,
  compact = false,
  showCampaignDetails = true,
}: {
  price: string;
  regularPrice: string;
  campaignLabel?: string;
  compact?: boolean;
  showCampaignDetails?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const percent = discountPercent(regularPrice, price);
  const label = campaignLabel?.trim();

  if (percent === null) return <span>{formatVnd(price)}</span>;

  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5',
        compact ? 'justify-center text-xs' : 'text-sm',
      )}
    >
      <span
        className="text-muted-foreground/75 line-through"
        aria-label={`${t('campaign.regularPrice')}: ${formatVnd(regularPrice)}`}
      >
        {formatVnd(regularPrice)}
      </span>
      <span
        className="font-semibold text-warning-foreground"
        aria-label={`${t('campaign.salePrice')}: ${formatVnd(price)}`}
      >
        {formatVnd(price)}
      </span>
      {showCampaignDetails ? (
        <>
          <span className="font-semibold text-warning-foreground" aria-hidden="true">
            −{percent}%
          </span>
          <span className="sr-only">{t('campaign.exactPercent', { percent })}</span>
        </>
      ) : null}
      {showCampaignDetails && label ? (
        <span
          className={cn(
            'min-w-0 max-w-full basis-full text-warning-foreground',
            compact ? 'truncate text-[10px]' : 'text-xs',
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
