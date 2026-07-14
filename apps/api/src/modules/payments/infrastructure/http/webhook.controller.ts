import { BadRequestException, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { gatewayKeySchema } from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import type { GatewayKey } from '../../domain/ports/payment-gateway.port';
import { HandleWebhookUseCase } from '../../application/use-cases/handle-webhook.use-case';

/** Gateway webhooks (§11.2) — the source of truth for payment. Needs the RAW body. */
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly handle: HandleWebhookUseCase) {}

  @Public()
  @Post(':gateway')
  @HttpCode(200)
  async receive(
    @Param('gateway', new ZodValidationPipe(gatewayKeySchema)) gateway: GatewayKey,
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<{ received: true }> {
    const raw = req.rawBody ?? (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {})));
    if (!raw?.length) throw new BadRequestException({ statusCode: 400, code: 'EMPTY_BODY', message: 'Empty webhook body' });
    await this.handle.execute(gateway, raw, req.headers as Record<string, string>);
    return { received: true };
  }
}
