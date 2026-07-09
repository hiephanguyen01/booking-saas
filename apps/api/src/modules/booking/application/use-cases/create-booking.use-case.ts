import { randomInt } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateBookingInput, ModeConfig } from '@booking/shared';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow, addMinutes } from '../../../../shared/time/time';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { FindOrCreateGuestUseCase } from '../../../identity-access/application/use-cases/find-or-create-guest.use-case';
import { PricingService } from '../../../listing/application/services/pricing.service';
import { LISTING_REPOSITORY, type IListingRepository } from '../../../listing/domain/ports/listing-repository.port';
import { RESOURCE_REPOSITORY, type IResourceRepository } from '../../../listing/domain/ports/resource-repository.port';
import { PRICING_RULE_REPOSITORY, type IPricingRuleRepository } from '../../../listing/domain/ports/pricing-rule-repository.port';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { HOLD_STORE, type IHoldStore } from '../../domain/ports/hold-store.port';
import { generateBookingCode } from '../../domain/booking-code';
import { blockedPeriod } from '../../domain/blocked-period';
import { SlotTakenError, SlotHeldError } from '../../domain/booking-errors';

export interface CreateBookingContext {
  /** Logged-in customer's user id, if any (else `input.guest` is required). */
  customerUserId?: string;
  idempotencyKey: string;
}

/**
 * Create a booking (§8.2 draft → pending_payment/pending_approval). Prices the
 * slot, acquires a Redis hold (Layer 1), inserts a draft, then transitions —
 * the Postgres exclusion constraint (Layer 2) is the hard double-booking guard,
 * surfaced as 409 SLOT_TAKEN. Idempotent on `(tenant, idempotency_key)`.
 */
@Injectable()
export class CreateBookingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resources: IResourceRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly pricingRules: IPricingRuleRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    @Inject(HOLD_STORE) private readonly holds: IHoldStore,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly guests: FindOrCreateGuestUseCase,
    private readonly pricing: PricingService,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(host: string, input: CreateBookingInput, ctx: CreateBookingContext): Promise<BookingRecord> {
    const tenant = await this.resolveTenant.execute(host);
    const customerId = await this.resolveCustomer(input, ctx);
    const startUtc = new Date(input.from);
    const endUtc = new Date(input.to);
    if (!(startUtc < endUtc)) {
      throw new BadRequestException({ statusCode: 400, code: 'INVALID_RANGE', message: 'from must be before to' });
    }
    if (startUtc < utcNow()) {
      throw new BadRequestException({ statusCode: 400, code: 'SLOT_IN_PAST', message: 'Cannot book a past slot' });
    }

    // Idempotent retry → return the existing booking.
    const existing = await this.tenantDb.forTenant(tenant.id, (tx) =>
      this.bookings.findByIdempotencyKey(tx, ctx.idempotencyKey),
    );
    if (existing) return existing;

    // Read the listing, price the slot, snapshot the policy.
    const { listing, quote, policyRules } = await this.tenantDb.forTenant(tenant.id, async (tx) => {
      const listing = await this.listings.findById(tx, input.listingId);
      if (!listing || listing.status !== 'published') {
        throw new NotFoundException({ statusCode: 404, code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
      }
      if (!listing.bookingModes.includes(input.mode)) {
        throw new BadRequestException({ statusCode: 400, code: 'MODE_NOT_ENABLED', message: `Listing does not enable "${input.mode}"` });
      }
      const resource = await this.resources.findById(tx, listing.resourceId);
      const pricingRules = (await this.pricingRules.listByListing(tx, listing.id)).map((r) => ({
        id: r.id, bookingMode: r.bookingMode, ruleType: r.ruleType, params: r.params, price: r.price, priority: r.priority,
      }));
      const quote = this.pricing.quote({
        mode: input.mode,
        modeConfig: listing.modeConfig as ModeConfig,
        pricingRules,
        timezone: resource?.timezone ?? 'Asia/Ho_Chi_Minh',
        startUtc,
        endUtc,
        quantity: 1,
        depositPercent: listing.depositPercent,
      });
      const policy = listing.cancellationPolicyId
        ? await tx.cancellationPolicy.findUnique({ where: { id: listing.cancellationPolicyId } })
        : null;
      return { listing, quote, policyRules: policy?.rules ?? [] };
    });
    const blocked = blockedPeriod({ start: startUtc, end: endUtc }, listing.bufferBefore, listing.bufferAfter);

    const holdId = await this.holds.acquire(listing.resourceId, blocked.start, blocked.end);
    if (!holdId) throw this.slotHeld();

    try {
      return await this.tenantDb.forTenant(tenant.id, async (tx) => {
        const again = await this.bookings.findByIdempotencyKey(tx, ctx.idempotencyKey);
        if (again) return again;

        const draft = await this.bookings.insertDraft(tx, tenant.id, {
          listingId: listing.id,
          partnerId: listing.partnerId,
          resourceId: listing.resourceId,
          customerId,
          code: generateBookingCode((max) => randomInt(max)),
          idempotencyKey: ctx.idempotencyKey,
          bookingMode: input.mode,
          timeslot: { start: startUtc, end: endUtc },
          blockedPeriod: blocked,
          guestCount: input.guestCount,
          quantity: 1,
          totalAmount: BigInt(quote.subtotal),
          discountAmount: 0n, // promotions are Task 1.11
          finalAmount: BigInt(quote.subtotal),
          depositAmount: BigInt(quote.depositAmount),
          cancellationPolicyId: listing.cancellationPolicyId,
          cancellationPolicySnapshot: policyRules,
          pricingSnapshot: quote,
          customerNote: input.customerNote ?? null,
        });

        const toStatus = listing.approvalRequired ? 'pending_approval' : 'pending_payment';
        const expiresAt = listing.approvalRequired ? addMinutes(utcNow(), 24 * 60) : addMinutes(utcNow(), 15);
        const booking = await this.bookings.applyTransition(tx, {
          id: draft.id,
          from: 'draft',
          to: toStatus,
          actor: 'system',
          actorId: customerId,
          expiresAt,
        });
        await this.outbox.emit(tx, {
          tenantId: tenant.id,
          eventType: 'booking.created',
          payload: { bookingId: booking.id, code: booking.code, status: booking.status },
        });
        return booking;
      });
    } catch (err) {
      await this.holds.release(listing.resourceId, holdId);
      if (err instanceof SlotTakenError) throw this.slotTaken();
      throw err;
    }
  }

  private async resolveCustomer(input: CreateBookingInput, ctx: CreateBookingContext): Promise<string> {
    if (ctx.customerUserId) return ctx.customerUserId;
    if (input.guest) {
      const user = await this.guests.execute(input.guest);
      return user.id;
    }
    throw new BadRequestException({
      statusCode: 400,
      code: 'GUEST_INFO_REQUIRED',
      message: 'Provide guest details or sign in to book',
    });
  }

  private slotHeld(): ConflictException {
    return new ConflictException({ statusCode: 409, code: 'SLOT_HELD', message: new SlotHeldError().message });
  }

  private slotTaken(): ConflictException {
    return new ConflictException({ statusCode: 409, code: 'SLOT_TAKEN', message: new SlotTakenError().message });
  }
}
