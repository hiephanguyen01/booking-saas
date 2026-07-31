import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateBookingInput, ModeConfig, QuoteResponse } from '@booking/contracts';
import {
  TenantDbService,
  type PrismaTx,
} from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow, DEFAULT_TIMEZONE } from '../../../../shared/time/time';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { FindOrCreateGuestUseCase } from '../../../identity-access/application/use-cases/find-or-create-guest.use-case';
import { priceQuote } from '../../../listing/application/pricing';
import { PreparePromotionUseCase } from '../../../promotions/application/use-cases/prepare-promotion.use-case';
import { ReservePromotionUseCase } from '../../../promotions/application/use-cases/reserve-promotion.use-case';
import { ResolveCommissionUseCase } from '../../../finance/application/use-cases/resolve-commission.use-case';
import { computeCommissionSplit } from '../../../../shared/domain/commission/commission-split';
import { snapshotToRates } from '../../../../shared/domain/commission/commission-snapshot';
import { ResolveAttributionUseCase } from '../../../affiliate/application/use-cases/resolve-attribution.use-case';
import { applyCustomRate } from '../../../affiliate/domain/affiliate-rate';
import { RecordLegalAcceptanceUseCase } from '../../../legal/application/use-cases/record-legal-acceptance.use-case';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../../listing/domain/ports/listing-repository.port';
import {
  RESOURCE_REPOSITORY,
  type IResourceRepository,
} from '../../../listing/domain/ports/resource-repository.port';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
} from '../../../listing/domain/ports/pricing-rule-repository.port';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import { HOLD_STORE, type IHoldStore } from '../../domain/ports/hold-store.port';
import { generateBookingCode } from '../../domain/booking-code';
import {
  IdempotencyConflictError,
  SlotTakenError,
  SlotHeldError,
} from '../../domain/booking-errors';
import {
  BOOKING_AVAILABILITY_READER,
  type IBookingAvailabilityReader,
} from '../../domain/ports/booking-availability-reader.port';
import {
  BOOKING_PARTNER_READER,
  type IBookingPartnerReader,
} from '../../domain/ports/booking-partner-reader.port';
import { validateSlotPolicy } from '../../domain/slot-policy';
import { Booking } from '../../domain/entities/booking.entity';
import { BookingPeriod } from '../../domain/value-objects/booking-period.value-object';
import { BookingMoney } from '../../domain/value-objects/booking-money.value-object';
import { buildBookingListingSnapshot } from '../../domain/booking-listing-snapshot';
import {
  BookingSlotHeld,
  BookingSlotPolicyRejected,
  BookingSlotTaken,
  GuestInfoRequired,
  StorefrontSuspended,
} from '../../domain/errors/booking-domain-errors';

export interface CreateBookingContext {
  /** Logged-in customer's user id, if any (else `input.guest` is required). */
  customerUserId?: string;
  idempotencyKey: string;
  /** Client IP for the checkout legal-acceptance row (§ legal). Not always available. */
  ip?: string | null;
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
    @Inject(BOOKING_AVAILABILITY_READER) private readonly availability: IBookingAvailabilityReader,
    @Inject(BOOKING_PARTNER_READER) private readonly partners: IBookingPartnerReader,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly guests: FindOrCreateGuestUseCase,
    private readonly preparePromotion: PreparePromotionUseCase, // Task 1.11 — in-tx promo reservation
    private readonly reservePromotion: ReservePromotionUseCase, // Task 1.11 — in-tx promo reservation
    private readonly commissions: ResolveCommissionUseCase, // Task 1.10 — in-tx commission snapshot
    private readonly attribution: ResolveAttributionUseCase, // Task 2.1 — in-tx affiliate attribution
    private readonly recordLegalAcceptance: RecordLegalAcceptanceUseCase, // Task 10 — checkout consent
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    host: string,
    input: CreateBookingInput,
    ctx: CreateBookingContext,
  ): Promise<BookingRecord> {
    const tenant = await this.resolveTenant.execute(host);
    if (!tenant.live) throw new StorefrontSuspended();
    const customerId = await this.resolveCustomer(input, ctx);
    const startUtc = new Date(input.from);
    const endUtc = new Date(input.to);
    const requestedPeriod = BookingPeriod.create(startUtc, endUtc, utcNow());

    // Idempotent retry → return the existing booking.
    const existing = await this.tenantDb.forTenant(tenant.id, (tx) =>
      this.bookings.findByIdempotencyKey(tx, ctx.idempotencyKey),
    );
    if (existing) return existing;

    // Read the listing, price the slot, snapshot the policy.
    const { listing, quote, effectivePolicyId, policyRules } = await this.tenantDb.forTenant(
      tenant.id,
      async (tx) => {
        const listing = await this.listings.findById(tx, input.listingId);
        Booking.assertListingBookable(listing, input.mode);
        const resource = await this.resources.findById(tx, listing.resourceId);
        const schedule = await this.availability.read(tx, listing.id, listing.resourceId);
        const slotError = validateSlotPolicy({
          mode: input.mode,
          modeConfig: listing.modeConfig as ModeConfig,
          bookingSelection: listing.bookingSelection,
          timezone: resource?.timezone ?? DEFAULT_TIMEZONE,
          startUtc,
          endUtc,
          now: utcNow(),
          schedule,
        });
        if (slotError) throw new BookingSlotPolicyRejected(slotError);
        const pricingRules = (await this.pricingRules.listByListing(tx, listing.id)).map((r) => ({
          id: r.id,
          bookingMode: r.bookingMode,
          ruleType: r.ruleType,
          params: r.params,
          price: r.price,
          salePrice: r.salePrice,
          priority: r.priority,
        }));
        const quote = priceQuote({
          mode: input.mode,
          modeConfig: listing.modeConfig as ModeConfig,
          pricingRules,
          timezone: resource?.timezone ?? DEFAULT_TIMEZONE,
          startUtc,
          endUtc,
          quantity: input.mode === 'inventory' ? input.quantity : 1,
          depositPercent: listing.depositPercent,
          bookingSelection: listing.bookingSelection,
          packageId: input.packageId,
        });
        Booking.assertExpectedSubtotal(input.expectedSubtotal, quote.subtotal);
        // §11.3 fallback (listing → partner default → tenant default) is already resolved
        // onto the listing record; snapshot the RESOLVED policy id + its rules so the
        // persisted id and the frozen tiers stay consistent.
        return {
          listing,
          quote,
          effectivePolicyId: listing.effectiveCancellationPolicy?.id ?? null,
          policyRules: listing.effectiveCancellationPolicy?.rules ?? [],
        };
      },
    );
    const period = requestedPeriod.withBuffers(listing.bufferBefore, listing.bufferAfter);
    const timeslot = period.timeslot;
    const blocked = period.blockedPeriod;
    const common = {
      listing,
      quote,
      effectivePolicyId,
      policyRules,
      customerId,
      input,
      timeslot,
      blocked,
      idempotencyKey: ctx.idempotencyKey,
      ip: ctx.ip ?? null,
    };

    // Inventory (§9.4): multi-unit, so no exclusion constraint. An advisory lock
    // per listing + an atomic stock count guarantees stock is never oversold.
    if (input.mode === 'inventory') {
      return this.insertBooking(tenant.id, ctx.idempotencyKey, () =>
        this.tenantDb.forTenant(tenant.id, async (tx) => {
          const again = await this.bookings.findByIdempotencyKey(tx, ctx.idempotencyKey);
          if (again) return again;
          const stock = listing.stockQuantity ?? 0;
          const used = await this.bookings.lockAndCountInventory(
            tx,
            listing.id,
            blocked.start,
            blocked.end,
          );
          Booking.assertInventoryCapacity(stock, used, input.quantity);
          return this.insertAndActivate(tx, tenant.id, {
            ...common,
            quantity: input.quantity,
            securityDeposit: BigInt(quote.securityDeposit),
          });
        }),
      );
    }

    // Exclusive (hourly/daily): Redis hold (Layer 1) + the exclusion constraint (Layer 2).
    const holdId = await this.holds.acquire(listing.resourceId, blocked.start, blocked.end);
    if (!holdId) throw this.slotHeld();
    try {
      const booking = await this.insertBooking(tenant.id, ctx.idempotencyKey, () =>
        this.tenantDb.forTenant(tenant.id, async (tx) => {
          const again = await this.bookings.findByIdempotencyKey(tx, ctx.idempotencyKey);
          if (again) return again;
          return this.insertAndActivate(tx, tenant.id, {
            ...common,
            quantity: 1,
            securityDeposit: 0n,
          });
        }),
      );
      // Success: release the hold now — the DB row (pending_payment) + the
      // exclusion constraint hold the slot, so leaving the Redis hold for its
      // full TTL would falsely block a re-booking after an early cancel.
      await this.holds.release(listing.resourceId, holdId);
      return booking;
    } catch (err) {
      await this.holds.release(listing.resourceId, holdId);
      if (err instanceof SlotTakenError) throw this.slotTaken();
      throw err;
    }
  }

  /**
   * Run an insert path, turning a lost idempotency-key race into the idempotent
   * result: two concurrent requests with the same key both pass the pre-check,
   * but the DB unique index lets only one insert — the loser (surfaced as
   * {@link IdempotencyConflictError}) re-reads and returns the winner's booking
   * instead of a 500.
   */
  private async insertBooking(
    tenantId: string,
    idempotencyKey: string,
    run: () => Promise<BookingRecord>,
  ): Promise<BookingRecord> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        const existing = await this.tenantDb.forTenant(tenantId, (tx) =>
          this.bookings.findByIdempotencyKey(tx, idempotencyKey),
        );
        if (existing) return existing;
      }
      throw err;
    }
  }

  /** Insert a draft then transition it live — shared by both booking paths. */
  private async insertAndActivate(
    tx: PrismaTx,
    tenantId: string,
    args: {
      listing: ListingRecord;
      quote: QuoteResponse;
      effectivePolicyId: string | null;
      policyRules: unknown;
      customerId: string;
      input: CreateBookingInput;
      timeslot: { start: Date; end: Date };
      blocked: { start: Date; end: Date };
      idempotencyKey: string;
      quantity: number;
      securityDeposit: bigint;
      ip: string | null;
    },
  ): Promise<BookingRecord> {
    // ── Task 1.11 + 2.2 (Promotions) ─────────────────────────────────────────
    // Resolve the promotion to apply (§12.1 no-stacking, code-wins): a supplied
    // code always wins; otherwise the best auto-applied campaign is chosen. The
    // winner is validated + priced BEFORE the insert (so the booking carries
    // discount_amount/final_amount + an immutable promotion_snapshot), and the
    // usage is atomically CLAIMED after the insert — all inside this one tx, so a
    // lost race for the last use (total or per-customer) rolls the booking back.
    // NOTE (finance wave): deposit is still computed on the pre-discount subtotal
    // — deposit-on-final and commission snapshotting are layered on separately.
    const subtotal = BigInt(args.quote.subtotal);
    const promo = await this.preparePromotion.execute(tx, {
      code: args.input.promoCode ?? null,
      listingId: args.listing.id,
      amount: subtotal,
      slotStart: args.timeslot.start,
      customerId: args.customerId,
      customerEmail: args.input.guest?.email ?? null,
      customerPhone: args.input.guest?.phone ?? null,
    });
    const { discountAmount, finalAmount } = BookingMoney.discounted(subtotal, promo);

    // ── Task 1.10 (Finance) ───────────────────────────────────────────────────
    // Freeze the applicable commission rule onto the booking so a later rule
    // change never touches this booking (§13.1). The ledger journal at completion
    // replays this snapshot, never the live rule.
    const isHouse = await this.partners.isHouse(tx, args.listing.partnerId);
    let commissionSnapshot = await this.commissions.execute(tx, {
      partnerId: args.listing.partnerId,
      listingTypeId: args.listing.listingTypeId,
      categoryId: args.listing.categoryId,
      isHouse,
    });

    // ── Task 2.1 (Affiliate attribution) ──────────────────────────────────────
    // Resolve the referral code to an attributable affiliate (self-referral /
    // self-dealing dropped silently, §15.2). When one applies, freeze the
    // affiliate's custom_rate into the commission snapshot so BOTH the ledger leg
    // and the tracked affiliate_commissions row use the same rate — keeping the
    // journal balanced. A miss leaves affiliateId null and the booking unchanged.
    let attribution: Awaited<ReturnType<typeof this.attribution.execute>> = null;
    if (args.input.refCode) {
      attribution = await this.attribution.execute(tx, {
        code: args.input.refCode,
        customerId: args.customerId,
        listingPartnerId: args.listing.partnerId,
      });
      if (attribution) {
        commissionSnapshot = applyCustomRate(commissionSnapshot, attribution.customRate);
      }
    }

    const fundedBy = promo?.snapshot.fundedBy ?? null;
    const split = computeCommissionSplit({
      totalAmount: subtotal,
      finalAmount,
      fundedBy,
      hasAffiliate: attribution !== null,
      rates: snapshotToRates(commissionSnapshot),
    });
    const partnerBasis = fundedBy === 'tenant' ? subtotal : finalAmount;
    const tenantCommissionGross = commissionSnapshot.isHouse
      ? 0n
      : partnerBasis - split.partnerShare;
    const depositAmount = BigInt(args.quote.depositAmount);
    BookingMoney.assertDepositCoversTenantCommission({
      isHouse: commissionSnapshot.isHouse,
      depositAmount,
      tenantCommissionGross,
      commissionRuleId: commissionSnapshot.ruleId,
    });

    const draft = await this.bookings.insertDraft(tx, tenantId, {
      listingId: args.listing.id,
      partnerId: args.listing.partnerId,
      resourceId: args.listing.resourceId,
      customerId: args.customerId,
      code: generateBookingCode((max) => randomInt(max)),
      idempotencyKey: args.idempotencyKey,
      bookingMode: args.input.mode,
      timeslot: args.timeslot,
      blockedPeriod: args.blocked,
      guestCount: args.input.guestCount,
      quantity: args.quantity,
      totalAmount: subtotal,
      discountAmount,
      finalAmount,
      depositAmount,
      securityDeposit: args.securityDeposit,
      promotionId: promo?.promotionId ?? null,
      promoCode: promo?.promoCode ?? null,
      promotionSnapshot: promo?.snapshot ?? null,
      commissionSnapshot,
      affiliateId: attribution?.affiliateId ?? null,
      referralCode: attribution?.referralCode ?? null,
      cancellationPolicyId: args.effectivePolicyId,
      cancellationPolicySnapshot: args.policyRules,
      pricingSnapshot: args.quote,
      listingSnapshot: buildBookingListingSnapshot({
        title: args.listing.title,
        slug: args.listing.slug,
        description: args.listing.description,
        photos: args.listing.photos,
        attributes: args.listing.attributes,
        attributeSchema: args.listing.attributeSchema,
        capacity: args.listing.capacity,
        group: args.listing.group,
      }),
      customerNote: args.input.customerNote ?? null,
    });
    if (promo) {
      await this.reservePromotion.execute(tx, tenantId, {
        promotionId: promo.promotionId,
        bookingId: draft.id,
        customerId: args.customerId,
        discountAmount: promo.discountAmount,
        usageLimitPerCustomer: promo.usageLimitPerCustomer,
      });
    }
    const { to: toStatus, expiresAt } = Booking.activationPlan(
      args.listing.approvalRequired,
      utcNow(),
    );
    const booking = await this.bookings.applyTransition(tx, {
      id: draft.id,
      from: 'draft',
      to: toStatus,
      actor: 'system',
      actorId: args.customerId,
      expiresAt,
    });

    // ── Task 10 (Legal — checkout consent) ────────────────────────────────────
    // No tick here by design (see ADR/legal spec): the storefront just shows a
    // notice + links at checkout and this write is unconditional and silent —
    // never gates the booking. A channel that never rendered the notice (or an
    // older client) sends neither field, and this is a no-op: no ids, no row.
    const acceptedVersionIds = args.input.acceptedVersionIds;
    if (acceptedVersionIds && acceptedVersionIds.length > 0) {
      await this.recordLegalAcceptance.execute(tx, {
        tenantId,
        userId: args.customerId,
        partnerId: null,
        acceptedVersionIds,
        // Requested, not recorded: legal resolves and stores the locale each
        // version was actually rendered in. No `requiredDocTypes` — checkout
        // consent is optional by design (spec §Consent capture: notice line
        // only) and must never fail a booking.
        requestedLocale: args.input.acceptedLocale ?? 'vi',
        ip: args.ip,
      });
    }

    await this.outbox.emit(tx, {
      tenantId,
      eventType: 'booking.created',
      payload: { bookingId: booking.id, code: booking.code, status: booking.status },
    });
    return booking;
  }

  private async resolveCustomer(
    input: CreateBookingInput,
    ctx: CreateBookingContext,
  ): Promise<string> {
    if (ctx.customerUserId) return ctx.customerUserId;
    if (input.guest) {
      const user = await this.guests.execute(input.guest);
      return user.id;
    }
    throw new GuestInfoRequired();
  }

  private slotHeld(): BookingSlotHeld {
    return new BookingSlotHeld(new SlotHeldError().message);
  }

  private slotTaken(): BookingSlotTaken {
    return new BookingSlotTaken(new SlotTakenError().message);
  }
}
