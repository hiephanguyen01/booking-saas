import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  markNoShowInputSchema,
  markReturnedInputSchema,
  uuidSchema,
  type BookingResponse,
  type CancelBookingResponse,
  type MarkNoShowInput,
  type MarkReturnedInput,
  type ReturnBookingResponse,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { PartnerBookingUseCase } from '../../application/use-cases/partner-booking.use-case';
import { CancelBookingUseCase } from '../../application/use-cases/cancel-booking.use-case';
import { InventoryFulfillmentUseCase } from '../../application/use-cases/inventory-fulfillment.use-case';
import { toBookingResponse, toCancelResponse, toReturnResponse } from '../../application/booking.mapper';

/** Partner-side booking management (§8.2). Scope via x-partner-id. */
@Controller('partner/bookings')
export class PartnerBookingController {
  constructor(
    private readonly partnerBooking: PartnerBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
    private readonly fulfillment: InventoryFulfillmentUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ctx(principal: SessionPrincipal) {
    return {
      tenantId: this.tenantContext.tenantIdOrThrow(),
      partnerId: this.tenantContext.partnerIdOrThrow(),
      actorId: principal.userId,
    };
  }

  @RequirePermissions('partner.bookings.approve')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<BookingResponse> {
    return toBookingResponse(await this.partnerBooking.approve(this.ctx(principal), id));
  }

  @RequirePermissions('partner.bookings.approve')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(markNoShowInputSchema)) body: MarkNoShowInput,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<BookingResponse> {
    return toBookingResponse(await this.partnerBooking.reject(this.ctx(principal), id, body.reason));
  }

  @RequirePermissions('partner.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/no-show')
  @HttpCode(200)
  async noShow(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(markNoShowInputSchema)) body: MarkNoShowInput,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<BookingResponse> {
    return toBookingResponse(await this.partnerBooking.markNoShow(this.ctx(principal), id, body.reason));
  }

  @RequirePermissions('partner.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(markNoShowInputSchema)) body: MarkNoShowInput,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<CancelBookingResponse> {
    const ctx = this.ctx(principal);
    const result = await this.cancelBooking.execute(ctx.tenantId, id, 'partner', {
      actorId: ctx.actorId,
      reason: body.reason,
    });
    return toCancelResponse(result);
  }

  @RequirePermissions('partner.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/pick-up')
  @HttpCode(200)
  async pickUp(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<BookingResponse> {
    return toBookingResponse(await this.fulfillment.markPickedUp(this.ctx(principal), id));
  }

  @RequirePermissions('partner.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/return')
  @HttpCode(200)
  async return(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(markReturnedInputSchema)) body: MarkReturnedInput,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<ReturnBookingResponse> {
    return toReturnResponse(await this.fulfillment.markReturned(this.ctx(principal), id, BigInt(body.damageAmount)));
  }
}
