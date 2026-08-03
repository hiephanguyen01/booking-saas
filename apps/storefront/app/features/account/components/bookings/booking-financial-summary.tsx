import { formatCurrency, type Locale } from '@booking/i18n';
import { NsI18n, useTranslation } from '@booking/i18n';

interface BookingFinancialSummaryProps {
  paidAmount: string;
  finalAmount: string;
  balanceAmount: string;
  locale: Locale;
  className?: string;
}

export function BookingFinancialSummary({
  paidAmount,
  finalAmount,
  balanceAmount,
  locale,
  className = '',
}: BookingFinancialSummaryProps) {
  const { t } = useTranslation(NsI18n.Account);
  const hasBalance = BigInt(balanceAmount) > 0n;
  const money = (value: string) => formatCurrency(BigInt(value), 'VND', locale);

  return (
    <dl
      className={`grid grid-cols-3 divide-x divide-border/70 rounded-lg bg-muted/30 ${className}`}
    >
      <FinancialValue
        label={t('bookings.payment.paidDeposit')}
        value={money(paidAmount)}
        tone="positive"
      />
      <FinancialValue label={t('bookings.payment.total')} value={money(finalAmount)} strong />
      <FinancialValue
        label={t('bookings.payment.balance')}
        value={hasBalance ? money(balanceAmount) : t('bookings.payment.paidInFull')}
        tone={hasBalance ? 'primary' : 'positive'}
        strong
      />
    </dl>
  );
}

function FinancialValue({
  label,
  value,
  tone = 'neutral',
  strong = false,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'primary';
  strong?: boolean;
}) {
  const toneClass = {
    neutral: 'text-foreground',
    positive: 'text-success',
    primary: 'text-primary',
  }[tone];

  return (
    <div className="min-w-0 px-2.5 py-3 text-center sm:px-4">
      <dt className="text-xs leading-4 text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 break-words tabular-nums text-sm ${toneClass} ${strong ? 'font-semibold' : 'font-medium'}`}
      >
        {value}
      </dd>
    </div>
  );
}
