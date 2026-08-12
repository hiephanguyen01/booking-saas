import * as React from 'react';
import type { SettlementTaxPositionDto } from '@booking/contracts';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DateTimeValue } from '~/components/date-time-value';
import { amountToneClass, Money } from '~/components/money';

/**
 * The auditable withholding trail of one settlement: what was assessed when the
 * transaction was accepted, what refunds reversed since, and what is left owing
 * to the tax authority.
 *
 * This reads `tax_withholding_events`, the append-only record — deliberately NOT
 * the settlement's own `partnerVatWithheld`/`partnerPitWithheld`, which are
 * recomputed on release and therefore cannot show the original assessment or the
 * reversals. An accountant reconciling a filing needs the chain, not the total.
 */
export function SettlementTaxTrail({
  taxPosition,
}: {
  taxPosition: SettlementTaxPositionDto | null;
}): React.JSX.Element | null {
  if (!taxPosition) return null;
  const hasReversal = taxPosition.reversalCount > 0;
  return (
    <DetailSection
      title="Thuế khấu trừ tại nguồn (NĐ 117/2025)"
      description={
        hasReversal
          ? 'Khấu trừ gốc không bị sửa. Mỗi lần hoàn tiền tạo một bản ghi hoàn thuế riêng; số cuối cùng là gốc trừ hoàn.'
          : 'Khấu trừ được chốt khi giao dịch được xác nhận, không phụ thuộc lệnh chi. Bản ghi là bất biến.'
      }
    >
      <DetailGrid columns={3}>
        <DetailField
          label="Doanh thu tính thuế"
          value={<Money value={taxPosition.assessedTaxableRevenue} />}
          emphasis="strong"
        />
        <DetailField
          label="Chốt thuế lúc"
          value={<DateTimeValue iso={taxPosition.assessedAt} />}
          hint="Kỳ khai thuế theo tháng của thời điểm này"
        />
        <DetailField
          label="Số lần hoàn thuế"
          value={hasReversal ? String(taxPosition.reversalCount) : undefined}
          omitWhenEmpty={!hasReversal}
        />

        <DetailField label="GTGT khấu trừ (gốc)" value={<Money value={taxPosition.assessedVat} />} />
        <DetailField label="TNCN khấu trừ (gốc)" value={<Money value={taxPosition.assessedPit} />} />
        <DetailField
          label="Doanh thu bị hoàn"
          value={
            hasReversal ? (
              <Money
                value={taxPosition.reversedTaxableRevenue}
                className={amountToneClass('negative')}
              />
            ) : undefined
          }
          omitWhenEmpty={!hasReversal}
        />

        {hasReversal ? (
          <>
            <DetailField
              label="GTGT đã hoàn lại"
              value={
                <Money value={taxPosition.reversedVat} className={amountToneClass('negative')} />
              }
            />
            <DetailField
              label="TNCN đã hoàn lại"
              value={
                <Money value={taxPosition.reversedPit} className={amountToneClass('negative')} />
              }
            />
            <DetailField label="" value={undefined} omitWhenEmpty />
          </>
        ) : null}

        <DetailField
          label="GTGT còn phải nộp"
          value={<Money value={taxPosition.netVat} />}
          emphasis="strong"
          hint={hasReversal ? 'gốc − đã hoàn' : undefined}
        />
        <DetailField
          label="TNCN còn phải nộp"
          value={<Money value={taxPosition.netPit} />}
          emphasis="strong"
          hint={hasReversal ? 'gốc − đã hoàn' : undefined}
        />
      </DetailGrid>
    </DetailSection>
  );
}
