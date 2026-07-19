import { Inject, Injectable } from '@nestjs/common';
import type { PaymentHistoryQuery } from '@booking/contracts';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
  type PaymentHistoryRecord,
} from '../../domain/ports/payment-repository.port';

@Injectable()
export class ListPlatformPaymentsUseCase {
  constructor(@Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository) {}

  execute(query: PaymentHistoryQuery): Promise<{ items: PaymentHistoryRecord[]; total: number }> {
    return this.payments.listPlatform(query);
  }
}
