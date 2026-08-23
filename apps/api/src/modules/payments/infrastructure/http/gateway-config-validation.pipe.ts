import type { PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import {
  upsertGatewayConfigInputSchema,
  type UpsertGatewayConfigInput,
} from '@booking/contracts';
import { InvalidGatewayConfig } from '../../application/payment-http-errors';

/** Provider-discriminated HTTP boundary with the legacy error envelope preserved. */
@Injectable()
export class GatewayConfigValidationPipe
  implements PipeTransform<unknown, UpsertGatewayConfigInput>
{
  transform(value: unknown): UpsertGatewayConfigInput {
    const parsed = upsertGatewayConfigInputSchema.safeParse(value);
    if (!parsed.success) throw new InvalidGatewayConfig(parsed.error.flatten());
    if (parsed.data.gateway === 'payos' && parsed.data.environment !== 'production') {
      throw new InvalidGatewayConfig({
        fieldErrors: { environment: ['PayOS chỉ hỗ trợ môi trường production'] },
      });
    }
    return parsed.data;
  }
}
