import { Controller, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { gatewayKeySchema, type WebhookAcknowledgementResponse } from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import type { GatewayKey } from '../../domain/ports/payment-gateway.port';
import { HandleWebhookUseCase } from '../../application/use-cases/handle-webhook.use-case';
import { EmptyWebhookBody } from '../../application/payment-http-errors';
import {
  GenericWebhookAcknowledgementResponseDto,
  ZaloPayWebhookAcknowledgementResponseDto,
} from './dto/payments.dto';

/** Gateway webhooks (§11.2) — the source of truth for payment. Needs the RAW body. */
@ApiTags('webhooks')
@ApiExtraModels(GenericWebhookAcknowledgementResponseDto, ZaloPayWebhookAcknowledgementResponseDto)
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly handle: HandleWebhookUseCase) {}

  @Public()
  @Post(':gateway')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive a gateway webhook (raw body) and reconcile payment' })
  @ApiParam({ name: 'gateway', type: 'string' })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(GenericWebhookAcknowledgementResponseDto) },
        { $ref: getSchemaPath(ZaloPayWebhookAcknowledgementResponseDto) },
      ],
    },
  })
  @ApiNoContentResponse({ description: 'MoMo webhook accepted' })
  async receive(
    @Param('gateway', new ZodValidationPipe(gatewayKeySchema)) gateway: GatewayKey,
    @Req() req: Request & { rawBody?: Buffer },
    @Res({ passthrough: true }) res: Response,
  ): Promise<WebhookAcknowledgementResponse | void> {
    const raw =
      req.rawBody ??
      (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {})));
    if (!raw?.length) throw new EmptyWebhookBody();
    const headers = Object.fromEntries(
      Object.entries(req.headers).flatMap(([name, value]) => {
        if (typeof value === 'string') return [[name, value]];
        return value?.[0] ? [[name, value[0]]] : [];
      }),
    );
    await this.handle.execute(gateway, raw, headers);

    if (gateway === 'momo') {
      res.status(204);
      return;
    }
    return gateway === 'zalopay'
      ? { return_code: 1, return_message: 'success' }
      : { success: true };
  }
}
