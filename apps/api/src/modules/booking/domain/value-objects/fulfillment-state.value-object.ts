import { vnd, type Vnd } from '../../../../shared/money/money';
import { settleDeposit } from '../deposit-settlement';
import { BookingNotConfirmed, BookingNotInventory } from '../errors/booking-domain-errors';
import { lateFee, overduePeriods } from '../late-fee';

export interface InventoryFulfillmentSettings {
  unit?: 'hour' | 'day';
  lateFeePerUnit?: string | number | bigint;
  basePrice?: string | number | bigint;
}

export class FulfillmentState {
  private constructor(
    private readonly status: string,
    private readonly bookingMode: string,
    private readonly dueAt: Date,
    private readonly quantity: number,
    private readonly securityDeposit: Vnd,
  ) {}

  static rehydrate(input: {
    status: string;
    bookingMode: string;
    endUtc: Date;
    quantity: number;
    securityDeposit: Vnd;
  }): FulfillmentState {
    return new FulfillmentState(
      input.status,
      input.bookingMode,
      input.endUtc,
      input.quantity,
      input.securityDeposit,
    );
  }

  planPickup(now: Date): { pickedUpAt: Date } {
    if (this.status !== 'confirmed') throw new BookingNotConfirmed();
    return { pickedUpAt: now };
  }

  planReturn(
    now: Date,
    damageAmount: Vnd,
    settings: InventoryFulfillmentSettings | undefined,
  ): {
    patch: { returnedAt: Date; damageAmount: Vnd; additionalCharges?: unknown };
    lateFee: Vnd;
    depositRefund: Vnd;
    depositShortfall: Vnd;
  } {
    if (this.bookingMode !== 'inventory') throw new BookingNotInventory();
    const unit = settings?.unit ?? 'day';
    const ratePerUnit = vnd(settings?.lateFeePerUnit ?? settings?.basePrice ?? '0');
    const fee = lateFee(overduePeriods(now, this.dueAt, unit), ratePerUnit, this.quantity);
    const { refund, shortfall } = settleDeposit(this.securityDeposit, damageAmount, fee);
    const additionalCharges = fee > 0n ? [{ type: 'late_fee', amount: fee.toString() }] : [];
    return {
      patch: {
        returnedAt: now,
        damageAmount,
        ...(additionalCharges.length > 0 ? { additionalCharges } : {}),
      },
      lateFee: fee,
      depositRefund: refund,
      depositShortfall: shortfall,
    };
  }
}
