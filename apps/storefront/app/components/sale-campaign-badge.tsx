import type { SaleCampaignSummary } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Tag, Timer } from 'lucide-react';
import { useLocale } from '~/hooks/use-locale';
import { campaignUrgency } from '~/lib/sale-campaign';
import { dateLabelInTz } from '~/lib/time';

/**
 * The running-campaign chip: what it is called, and how long is left to book it.
 *
 * Carries no price. On a card the visitor has not given dates for there is no
 * bookable window to quote, and the campaign's deepest discount is a ceiling
 * rather than a rate they can count on — the "-N%" ribbon owns that number.
 */
export function SaleCampaignBadge({
  campaign,
  className,
  showIcon = true,
}: {
  campaign: SaleCampaignSummary | null;
  className?: string;
  showIcon?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  if (!campaign) return null;
  const urgency = campaignUrgency(campaign);
  const deadline =
    urgency.kind === 'lastDay'
      ? t('campaign.lastDay')
      : urgency.kind === 'urgent'
        ? t('campaign.daysLeft', { count: urgency.days })
        : urgency.kind === 'deadline'
          ? // Already the last bookable day in the resource's timezone;
            // `dateLabelInTz` reads a literal date back in UTC, so no viewer
            // offset can slide it to the neighbouring day.
            t('campaign.bookBy', { date: dateLabelInTz(urgency.date, 'UTC', locale) })
          : null;
  const schedule = campaign.schedule
    ? scheduleLabel(campaign.schedule, locale, (key) => t(key))
    : null;

  return (
    <span className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <Badge
        variant="outline"
        className="max-w-full rounded-sm border-warning/40 bg-warning/15 px-1.5 py-0 text-[11px] text-warning-foreground"
      >
        {showIcon ? <Tag className="size-3 shrink-0" aria-hidden="true" /> : null}
        {/* Partner-authored, already in the tenant's language — shown verbatim,
            never translated. */}
        <span className="truncate">{campaign.label ?? t('campaign.unnamed')}</span>
      </Badge>
      {deadline ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs',
            urgency.kind === 'deadline'
              ? 'text-muted-foreground'
              : 'font-medium text-warning-foreground',
          )}
        >
          <Timer className="size-3 shrink-0" aria-hidden="true" />
          {deadline}
        </span>
      ) : null}
      {schedule ? <span className="text-xs text-muted-foreground">{schedule}</span> : null}
    </span>
  );
}

/** Localized campaign timing in the only display order we support. */
function scheduleLabel(
  schedule: NonNullable<SaleCampaignSummary['schedule']>,
  locale: string,
  t: (key: 'campaign.variedSchedule' | 'campaign.allDaySale') => string,
): string {
  if (schedule.varies) return t('campaign.variedSchedule');

  const parts: string[] = [];
  if (schedule.weekdays.length) {
    const weekday = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
      weekday: 'short',
      timeZone: 'UTC',
    });
    // 2023-01-01 was a Sunday, matching the API's 0=Sun … 6=Sat convention.
    parts.push(
      schedule.weekdays
        .map((day) => weekday.format(new Date(Date.UTC(2023, 0, day + 1))))
        .join(', '),
    );
  }
  if (schedule.timeFrom && schedule.timeTo) parts.push(`${schedule.timeFrom}–${schedule.timeTo}`);
  else if (!schedule.timeFrom && !schedule.timeTo && (schedule.dateFrom || schedule.dateTo))
    parts.push(t('campaign.allDaySale'));
  if (schedule.dateFrom && schedule.dateTo) {
    const from = dateLabelInTz(schedule.dateFrom, 'UTC', locale);
    const to = dateLabelInTz(schedule.dateTo, 'UTC', locale);
    parts.push(schedule.dateFrom === schedule.dateTo ? from : `${from} – ${to}`);
  }
  return parts.join(' · ');
}
