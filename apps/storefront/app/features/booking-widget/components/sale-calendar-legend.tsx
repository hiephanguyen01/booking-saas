import { NsI18n, useTranslation } from '@booking/i18n';
import { Flame } from 'lucide-react';

export function SaleCalendarLegend() {
  const { t } = useTranslation(NsI18n.Listing);

  return (
    <ul
      className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
      aria-label={t('campaign.calendarSaleHeading')}
    >
      <li className="flex items-center gap-1.5">
        <span
          className="size-3 rounded-sm border border-warning/50 bg-warning/15"
          aria-hidden="true"
        />
        <span>{t('campaign.allDaySale')}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="grid size-3 place-items-center rounded-sm border border-warning/50 bg-warning/5 text-warning-foreground [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_3px,color-mix(in_oklch,var(--warning)_25%,transparent)_3px,color-mix(in_oklch,var(--warning)_25%,transparent)_5px)]"
          aria-hidden="true"
        >
          <Flame className="size-2 fill-current" />
        </span>
        <span>{t('campaign.partialDaySale')}</span>
      </li>
    </ul>
  );
}
