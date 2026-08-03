import { useEffect, useState } from 'react';
import { cn } from '@booking/ui/lib/utils';
import { NsI18n, useTranslation } from '@booking/i18n';
import { intlLocale } from '~/lib/intl';
import { DEFAULT_TZ } from '~/lib/time';

const DAY_MS = 86_400_000;
const MARKET_DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: DEFAULT_TZ,
});

type ReviewTimeVariant = 'day' | 'precise';

export function ReviewTime({
  value,
  locale,
  variant = 'precise',
  className,
}: {
  value: string;
  locale: 'vi' | 'en';
  variant?: ReviewTimeVariant;
  className?: string;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const absolute = formatAbsoluteDate(value, locale);
  const todayLabel = t('reviewTime.today');
  const [relative, setRelative] = useState<string | null>(null);

  useEffect(() => {
    const update = (): void =>
      setRelative(formatRelativeTime(value, locale, variant, Date.now(), todayLabel));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [locale, todayLabel, value, variant]);

  return (
    <time className={cn(className)} dateTime={value} title={absolute}>
      {relative ?? absolute}
    </time>
  );
}

function formatAbsoluteDate(value: string, locale: 'vi' | 'en'): string {
  return new Intl.DateTimeFormat(intlLocale(locale, 'en-US'), {
    dateStyle: 'long',
    timeZone: DEFAULT_TZ,
  }).format(new Date(value));
}

function formatRelativeTime(
  value: string,
  locale: 'vi' | 'en',
  variant: ReviewTimeVariant,
  now: number,
  todayLabel: string,
): string {
  const timestamp = new Date(value).getTime();
  if (variant === 'day') {
    const days = marketCalendarDay(timestamp) - marketCalendarDay(now);
    if (days === 0) return todayLabel;
    return new Intl.RelativeTimeFormat(intlLocale(locale, 'en-US'), {
      numeric: 'auto',
    }).format(days, 'day');
  }

  let duration = Math.round((timestamp - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale, 'en-US'), {
    numeric: 'always',
  });
  const divisions = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.345, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ] as const;

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }

  return formatter.format(Math.round(duration), 'year');
}

function marketCalendarDay(timestamp: number): number {
  const parts = MARKET_DAY_FORMATTER.formatToParts(timestamp);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}
