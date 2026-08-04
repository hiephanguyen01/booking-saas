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

  // Three money columns need ~110px each; below ~400px that turns amounts and
  // "Đã thanh toán đủ" into two- and three-line stacks. Fall back to labelled
  // rows there and only go side-by-side once the columns have room.
  return (
    <dl
      className={`grid grid-cols-1 divide-y divide-border/70 rounded-lg bg-muted/30 min-[400px]:grid-cols-3 min-[400px]:divide-x min-[400px]:divide-y-0 ${className}`}
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
    // Label over value, not label-beside-value: "Còn lại phải thanh toán" next
    // to "Đã thanh toán đủ" does not fit one 320px row, and centring only starts
    // once the three columns are side by side again.
    <div className="min-w-0 px-4 py-2.5 min-[400px]:px-2.5 min-[400px]:py-3 min-[400px]:text-center sm:px-4">
      <dt className="text-xs leading-4 text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 break-words tabular-nums text-sm ${toneClass} ${strong ? 'font-semibold' : 'font-medium'}`}
      >
        {value}
      </dd>
    </div>
  );
}
