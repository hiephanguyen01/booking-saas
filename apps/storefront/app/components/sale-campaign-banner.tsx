import type { SaleCampaignSummary } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import { Flame } from 'lucide-react';
import { SaleCampaignBadge } from '~/components/sale-campaign-badge';
import { campaignHeadlinePercent } from '~/lib/sale-campaign';

interface SaleCampaignPresentationProps {
  campaign: SaleCampaignSummary | null;
  exactPercent?: number | null;
}

/** Campaign context for a listing detail or its currently priced room. */
export function SaleCampaignBanner({
  campaign,
  exactPercent = null,
  compact = false,
}: SaleCampaignPresentationProps & { compact?: boolean }) {
  const { t } = useTranslation(NsI18n.Listing);
  const headline = campaignHeadlinePercent(campaign, exactDiscountPercent(exactPercent));
  if (!campaign && !headline?.exact) return null;

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning/10 text-left text-warning-foreground',
        compact ? 'px-3 py-2' : 'px-4 py-3',
      )}
    >
      <Flame
        className={cn('shrink-0', compact ? 'mt-0.5 size-4' : 'mt-0.5 size-5')}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        {campaign ? (
          <SaleCampaignBadge campaign={campaign} showIcon={false} />
        ) : (
          <p className="text-sm font-semibold">{t('campaign.unnamed')}</p>
        )}
        {headline ? (
          <p className={cn('font-semibold', campaign && 'mt-1', compact ? 'text-xs' : 'text-sm')}>
            {headline.exact
              ? `−${headline.percent}%`
              : t('campaign.upTo', { percent: headline.percent })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Shared image ribbon: exact only for a priced window, otherwise campaign ceiling. */
export function SaleCampaignRibbon({
  campaign,
  exactPercent = null,
}: SaleCampaignPresentationProps) {
  const { t } = useTranslation(NsI18n.Listing);
  const headline = campaignHeadlinePercent(campaign, exactDiscountPercent(exactPercent));
  if (!headline) return null;

  return (
    <span className="absolute top-6 left-0 flex min-h-10 min-w-18 items-center bg-warning py-1 pr-5 pl-2 text-sm leading-4 font-semibold text-warning-foreground [clip-path:polygon(0_0,100%_0,84%_50%,100%_100%,0_100%)]">
      {headline.exact ? `−${headline.percent}%` : t('campaign.upTo', { percent: headline.percent })}
    </span>
  );
}

function exactDiscountPercent(value: number | null): number | null {
  return Number.isInteger(value) && value !== null && value > 0 && value <= 100 ? value : null;
}
