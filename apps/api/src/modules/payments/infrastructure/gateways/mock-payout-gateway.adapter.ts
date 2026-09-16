import { Injectable } from '@nestjs/common';
import type {
  IPayoutGatewayPort,
  PayoutDisburseInput,
  PayoutDisburseResult,
} from '../../domain/ports/payout-gateway.port';

@Injectable()
export class MockPayoutGatewayAdapter implements IPayoutGatewayPort {
  disburse(_input: PayoutDisburseInput): Promise<PayoutDisburseResult> {
    const suffix = Math.floor(100000 + Math.random() * 900000);
    return Promise.resolve({
      status: 'succeeded',
      reference: `FT_AUTO_${suffix}`,
      gatewayTxnId: `MOCK_TXN_${suffix}`,
    });
  }
}
