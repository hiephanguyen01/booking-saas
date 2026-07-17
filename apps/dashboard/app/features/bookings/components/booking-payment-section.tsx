import * as React from 'react';
import type { AdditionalCharge } from '@booking/contracts';
import { Separator } from '@booking/ui/components/ui/separator';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailRow, DetailRowTotal } from '@booking/ui/components/detail/detail-row';
import { Money } from '~/components/money';
import { CHARGE_LABEL } from '~/constants/booking';
import { subtractMoney } from '~/lib/format';

/**
 * The "Thanh toán" section of the booking detail: price breakdown, additional
 * charges and the paid/remaining balance. Every field is common to both booking
 * audiences, so it takes the explicit amounts rather than a whole response shape.
 */
export function BookingPaymentSection({
  totalAmount,
  discountAmount,
  promoCode,
  finalAmount,
  additionalCharges,
  depositAmount,
  paidAmount,
}: {
  totalAmount: string;
  discountAmount: string;
  promoCode: string | null;
  finalAmount: string;
  additionalCharges: AdditionalCharge[];
  depositAmount: string;
  paidAmount: string;
}): React.JSX.Element {
  const remaining = subtractMoney(finalAmount, paidAmount);

  return (
    <DetailSection title="Thanh toán">
      <div className="space-y-1.5">
        <DetailRow label="Tạm tính" value={<Money value={totalAmount} />} />
        {discountAmount !== '0' ? (
          <DetailRow
            label={
              <>
                Giảm giá
                {promoCode ? <span className="ml-1 font-mono text-xs">{promoCode}</span> : null}
              </>
            }
            value={
              <>
                <span aria-hidden>−</span> <Money value={discountAmount} />
              </>
            }
          />
        ) : null}
        <DetailRowTotal label="Thành tiền" value={<Money value={finalAmount} />} />
      </div>

      {additionalCharges.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Phát sinh thêm
          </p>
          {additionalCharges.map((charge, i) => (
            <DetailRow
              key={`${charge.type}-${i}`}
              label={CHARGE_LABEL[charge.type] ?? charge.type}
              value={
                <>
                  <span aria-hidden>+</span> <Money value={charge.amount} />
                </>
              }
            />
          ))}
        </div>
      ) : null}

      <Separator className="my-3" />

      <div className="space-y-1.5">
        {depositAmount !== '0' ? (
          <DetailRow label="Đặt cọc" value={<Money value={depositAmount} />} />
        ) : null}
        <DetailRow label="Đã thanh toán" value={<Money value={paidAmount} />} />
        {remaining !== null ? (
          <DetailRowTotal label="Còn lại" value={<Money value={remaining} />} />
        ) : null}
      </div>
    </DetailSection>
  );
}
