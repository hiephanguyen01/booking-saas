import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { defaultCommissionSnapshot } from '../../../../shared/domain/commission/commission-snapshot';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { ResolveAttributionUseCase } from '../../../affiliate/application/use-cases/resolve-attribution.use-case';
import type { ResolveCommissionUseCase } from '../../../finance/application/use-cases/resolve-commission.use-case';
import type { FindOrCreateGuestUseCase } from '../../../identity-access/application/use-cases/find-or-create-guest.use-case';
import type { RecordLegalAcceptanceUseCase } from '../../../legal/application/use-cases/record-legal-acceptance.use-case';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../listing/domain/ports/listing-repository.port';
import type { IPricingRuleRepository } from '../../../listing/domain/ports/pricing-rule-repository.port';
import type { IResourceRepository } from '../../../listing/domain/ports/resource-repository.port';
import type { PreparePromotionUseCase } from '../../../promotions/application/use-cases/prepare-promotion.use-case';
import type { ReservePromotionUseCase } from '../../../promotions/application/use-cases/reserve-promotion.use-case';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { IdempotencyConflictError, SlotTakenError } from '../../domain/booking-errors';
import {
  BookingOutOfStock,
  BookingSlotHeld,
  BookingSlotTaken,
  GuestInfoRequired,
  StorefrontSuspended,
} from '../../domain/errors/booking-domain-errors';
import type { IBookingAvailabilityReader } from '../../domain/ports/booking-availability-reader.port';
import type { IBookingPartnerReader } from '../../domain/ports/booking-partner-reader.port';
import type {
  BookingRecord,
  IBookingRepository,
  InsertBookingData,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import type { IHoldStore } from '../../domain/ports/hold-store.port';
import { CreateBookingUseCase } from './create-booking.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const RESOURCE_ID = 'resource-1';
const PARTNER_ID = 'partner-1';
const CUSTOMER_ID = 'customer-1';
const IDEMPOTENCY_KEY = 'idem-1';

const NOW = new Date('2026-09-01T00:00:00Z');
const START = new Date('2026-09-10T02:00:00Z');
const END = new Date('2026-09-11T02:00:00Z');

/** Only the columns the use case and the pricing kernel read off a listing. */
function listing(overrides: Record<string, unknown> = {}): ListingRecord {
  return {
    id: LISTING_ID,
    partnerId: PARTNER_ID,
    resourceId: RESOURCE_ID,
    listingTypeId: 'listing-type-1',
    categoryId: 'category-1',
    title: 'Studio A',
    slug: 'studio-a',
    description: null,
    photos: [],
    attributes: {},
    attributeSchema: [],
    capacity: 4,
    group: null,
    status: 'published',
    bookingModes: ['daily', 'inventory'],
    bookingSelection: 'flexible_duration',
    depositPercent: 100,
    bufferBefore: 0,
    bufferAfter: 0,
    approvalRequired: false,
    stockQuantity: 5,
    effectiveCancellationPolicy: {
      id: 'policy-1',
      rules: [{ hoursBefore: 24, refundPercent: 100 }],
    },
    modeConfig: {
      daily: { basePricePerNight: '500000', leadTimeMin: 0, minNights: 1, maxNights: 30 },
      inventory: { unit: 'day', basePrice: '300000', securityDeposit: '100000' },
    },
    ...overrides,
  } as unknown as ListingRecord;
}

interface Options {
  live?: boolean;
  existing?: BookingRecord | null;
  listing?: ListingRecord;
  holdId?: string | null;
  inventoryUsed?: number;
  promo?: unknown;
  attribution?: unknown;
  /** Thrown by `applyTransition` — the DB-level races surface there. */
  transitionError?: Error;
  /** Resolved on the second read after an idempotency-key race is lost. */
  raceWinner?: BookingRecord;
}

interface Harness {
  readonly useCase: CreateBookingUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  readonly calls: string[];
  readonly drafts: InsertBookingData[];
  readonly transitions: TransitionParams[];
  readonly events: Array<{ eventType: string; payload: Record<string, unknown> }>;
  readonly commissionTargets: unknown[];
  readonly attributionCalls: unknown[];
  readonly legalCalls: unknown[];
  readonly reservations: unknown[];
  readonly releasedHolds: string[];
}

function harness(options: Options = {}): Harness {
  const calls: string[] = [];
  const drafts: InsertBookingData[] = [];
  const transitions: TransitionParams[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const commissionTargets: unknown[] = [];
  const attributionCalls: unknown[] = [];
  const legalCalls: unknown[] = [];
  const reservations: unknown[] = [];
  const releasedHolds: string[] = [];
  let readsOfKey = 0;

  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx, now: NOW });

  const bookings = fakePort<IBookingRepository>({
    findByIdempotencyKey: () => {
      readsOfKey += 1;
      calls.push('findByKey');
      if (options.existing) return Promise.resolve(options.existing);
      // A lost race is only visible on the re-read after the conflict.
      if (options.raceWinner && readsOfKey > 2) return Promise.resolve(options.raceWinner);
      return Promise.resolve(null);
    },
    lockAndCountInventory: () => {
      calls.push('lockInventory');
      return Promise.resolve(options.inventoryUsed ?? 0);
    },
    insertDraft: (_tx, _tenantId, data) => {
      calls.push('insertDraft');
      drafts.push(data);
      return Promise.resolve({ id: 'booking-1', code: data.code } as unknown as BookingRecord);
    },
    applyTransition: (_tx, params) => {
      calls.push('applyTransition');
      transitions.push(params);
      if (options.transitionError) throw options.transitionError;
      return Promise.resolve({
        id: 'booking-1',
        code: 'BK-0001',
        status: params.to,
      } as unknown as BookingRecord);
    },
  });

  const holds = fakePort<IHoldStore>({
    acquire: () => {
      calls.push('acquireHold');
      return Promise.resolve(options.holdId === undefined ? 'hold-1' : options.holdId);
    },
    release: (_resourceId, holdId) => {
      calls.push('releaseHold');
      releasedHolds.push(holdId);
      return Promise.resolve();
    },
  });

  const useCase = new CreateBookingUseCase(
    fakePort<IListingRepository>({ findById: () => Promise.resolve(options.listing ?? listing()) }),
    fakePort<IResourceRepository>({
      findById: () => Promise.resolve({ timezone: 'Asia/Ho_Chi_Minh' } as never),
    }),
    fakePort<IPricingRuleRepository>({ listByListing: () => Promise.resolve([]) }),
    bookings,
    holds,
    fakePort<IBookingAvailabilityReader>({
      read: () => Promise.resolve({ weekly: [], exceptions: [] }),
    }),
    fakePort<IBookingPartnerReader>({ isHouse: () => Promise.resolve(false) }),
    fakeCollaborator<ResolveTenantByHostUseCase>({
      execute: () => Promise.resolve({ id: TENANT_ID, live: options.live ?? true }),
    }),
    fakeCollaborator<FindOrCreateGuestUseCase>({
      execute: () => {
        calls.push('findOrCreateGuest');
        return Promise.resolve({ id: 'guest-user-1' });
      },
    }),
    fakeCollaborator<PreparePromotionUseCase>({
      execute: () => Promise.resolve(options.promo ?? null),
    }),
    fakeCollaborator<ReservePromotionUseCase>({
      execute: (_tx: unknown, _tenantId: unknown, data: unknown) => {
        calls.push('reservePromotion');
        reservations.push(data);
        return Promise.resolve();
      },
    }),
    fakeCollaborator<ResolveCommissionUseCase>({
      execute: (_tx: unknown, target: { serviceDate: Date }) => {
        commissionTargets.push(target);
        return Promise.resolve(defaultCommissionSnapshot(false, target.serviceDate));
      },
    }),
    fakeCollaborator<ResolveAttributionUseCase>({
      execute: (_tx: unknown, req: unknown) => {
        calls.push('attribution');
        attributionCalls.push(req);
        return Promise.resolve(options.attribution ?? null);
      },
    }),
    fakeCollaborator<RecordLegalAcceptanceUseCase>({
      execute: (_tx: unknown, args: unknown) => {
        calls.push('legal');
        legalCalls.push(args);
        return Promise.resolve();
      },
    }),
    tenantDb.service,
    new OutboxService(),
  );

  return {
    useCase,
    tenantDb,
    calls,
    drafts,
    transitions,
    events,
    commissionTargets,
    attributionCalls,
    legalCalls,
    reservations,
    releasedHolds,
  };
}

const dailyInput = (overrides: Record<string, unknown> = {}) =>
  ({
    listingId: LISTING_ID,
    mode: 'daily',
    from: START.toISOString(),
    to: END.toISOString(),
    guestCount: 2,
    ...overrides,
  }) as Parameters<CreateBookingUseCase['execute']>[1];

const inventoryInput = (overrides: Record<string, unknown> = {}) =>
  ({
    listingId: LISTING_ID,
    mode: 'inventory',
    from: START.toISOString(),
    to: END.toISOString(),
    guestCount: 1,
    quantity: 2,
    ...overrides,
  }) as Parameters<CreateBookingUseCase['execute']>[1];

const ctx = { customerUserId: CUSTOMER_ID, idempotencyKey: IDEMPOTENCY_KEY, ip: '1.2.3.4' };

describe('CreateBookingUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses to sell on a suspended storefront', async () => {
    const { useCase, calls } = harness({ live: false });

    await expect(useCase.execute(HOST, dailyInput(), ctx)).rejects.toBeInstanceOf(
      StorefrontSuspended,
    );
    expect(calls).toEqual([]);
  });

  it('requires guest details when nobody is logged in', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(HOST, dailyInput(), { idempotencyKey: IDEMPOTENCY_KEY }),
    ).rejects.toBeInstanceOf(GuestInfoRequired);
  });

  it('creates the guest user and books as them', async () => {
    const { useCase, calls, drafts } = harness();

    await useCase.execute(
      HOST,
      dailyInput({ guest: { email: 'a@b.vn', name: 'A', phone: '09' } }),
      {
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    );

    expect(calls).toContain('findOrCreateGuest');
    expect(drafts[0]?.customerId).toBe('guest-user-1');
  });

  it('returns the existing booking on an idempotent retry, pricing nothing', async () => {
    const existing = { id: 'booking-existing' } as unknown as BookingRecord;
    const { useCase, calls } = harness({ existing });

    await expect(useCase.execute(HOST, dailyInput(), ctx)).resolves.toBe(existing);
    expect(calls).toEqual(['findByKey']);
  });

  it('holds the slot in Redis for an exclusive booking and releases it on success', async () => {
    // The DB row plus the exclusion constraint hold the slot once inserted, so
    // leaving the Redis hold for its full TTL would falsely block a re-booking
    // after an early cancel.
    const { useCase, calls, releasedHolds } = harness();

    await useCase.execute(HOST, dailyInput(), ctx);

    expect(calls).toContain('acquireHold');
    expect(releasedHolds).toEqual(['hold-1']);
  });

  it('reports a held slot without inserting anything', async () => {
    const { useCase, calls } = harness({ holdId: null });

    await expect(useCase.execute(HOST, dailyInput(), ctx)).rejects.toBeInstanceOf(BookingSlotHeld);
    expect(calls).not.toContain('insertDraft');
  });

  it('translates the exclusion-constraint violation and still releases the hold', async () => {
    // Layer 2 is the hard guarantee; a lost race there must not leave the Redis
    // hold behind to block the winner's neighbours for the rest of its TTL.
    const { useCase, releasedHolds } = harness({ transitionError: new SlotTakenError() });

    await expect(useCase.execute(HOST, dailyInput(), ctx)).rejects.toBeInstanceOf(BookingSlotTaken);
    expect(releasedHolds).toEqual(['hold-1']);
  });

  it('releases the hold even when the failure is not a slot conflict', async () => {
    const { useCase, releasedHolds } = harness({
      transitionError: new Error('database is on fire'),
    });

    await expect(useCase.execute(HOST, dailyInput(), ctx)).rejects.toThrow('database is on fire');
    expect(releasedHolds).toEqual(['hold-1']);
  });

  it('resolves a lost idempotency-key race into the winner instead of a 500', async () => {
    // Two concurrent requests with the same key both pass the pre-check; the
    // unique index lets only one insert, and the loser must return the winner.
    const winner = { id: 'booking-winner' } as unknown as BookingRecord;
    const { useCase } = harness({
      transitionError: new IdempotencyConflictError(),
      raceWinner: winner,
    });

    await expect(useCase.execute(HOST, dailyInput(), ctx)).resolves.toBe(winner);
  });

  it('takes no Redis hold for inventory — stock is guarded by lock and count', async () => {
    // Multi-unit inventory has no exclusion constraint, so a resource-scoped
    // overlap hold would wrongly block a second concurrent renter.
    const { useCase, calls } = harness();

    await useCase.execute(HOST, inventoryInput(), ctx);

    expect(calls).not.toContain('acquireHold');
    expect(calls).toContain('lockInventory');
  });

  it('refuses to oversell inventory', async () => {
    const { useCase, calls } = harness({ inventoryUsed: 4 });

    // stock 5, 4 already out, 2 requested.
    await expect(useCase.execute(HOST, inventoryInput(), ctx)).rejects.toBeInstanceOf(
      BookingOutOfStock,
    );
    expect(calls).not.toContain('insertDraft');
  });

  it('scales the security deposit by the quantity rented', async () => {
    const { useCase, drafts } = harness();

    await useCase.execute(HOST, inventoryInput(), ctx);

    expect(drafts[0]).toMatchObject({ quantity: 2, securityDeposit: 200_000n });
  });

  it('holds no security deposit on an exclusive booking', async () => {
    const { useCase, drafts } = harness();

    await useCase.execute(HOST, dailyInput(), ctx);

    expect(drafts[0]).toMatchObject({ quantity: 1, securityDeposit: 0n });
  });

  it('freezes the commission for the SERVICE date, not the booking date', async () => {
    // A booking made today for a session months out is taxed at the rate in force
    // on the day the service is delivered.
    const { useCase, commissionTargets } = harness();

    await useCase.execute(HOST, dailyInput(), ctx);

    expect(commissionTargets).toEqual([
      {
        tenantId: TENANT_ID,
        partnerId: PARTNER_ID,
        listingTypeId: 'listing-type-1',
        categoryId: 'category-1',
        isHouse: false,
        serviceDate: START,
      },
    ]);
  });

  it('resolves attribution only when a referral code was supplied', async () => {
    const without = harness();
    await without.useCase.execute(HOST, dailyInput(), ctx);
    expect(without.calls).not.toContain('attribution');

    const withCode = harness({
      attribution: { affiliateId: 'affiliate-1', referralCode: 'REF9', customRate: 7n },
    });
    await withCode.useCase.execute(HOST, dailyInput({ refCode: 'REF9' }), ctx);
    expect(withCode.attributionCalls).toEqual([
      { code: 'REF9', customerId: CUSTOMER_ID, listingPartnerId: PARTNER_ID },
    ]);
    expect(withCode.drafts[0]).toMatchObject({ affiliateId: 'affiliate-1', referralCode: 'REF9' });
  });

  it("bakes the affiliate's custom rate into the frozen commission snapshot", async () => {
    // Both the ledger leg and the tracked affiliate_commissions row replay this
    // snapshot; if only one of them saw the override the journal would not balance.
    const { useCase, drafts } = harness({
      attribution: { affiliateId: 'affiliate-1', referralCode: 'REF9', customRate: 7n },
    });

    await useCase.execute(HOST, dailyInput({ refCode: 'REF9' }), ctx);

    expect(drafts[0]?.commissionSnapshot).toMatchObject({
      affiliateRateType: 'percent',
      affiliateRate: '7',
    });
  });

  it('records checkout consent only when the client actually sent versions', async () => {
    // The notice at checkout has no tick, so an older client sends nothing and
    // this must be a silent no-op rather than a failed booking.
    const without = harness();
    await without.useCase.execute(HOST, dailyInput(), ctx);
    expect(without.calls).not.toContain('legal');

    const withConsent = harness();
    await withConsent.useCase.execute(
      HOST,
      dailyInput({ acceptedVersionIds: ['v1', 'v2'], acceptedLocale: 'en' }),
      ctx,
    );
    expect(withConsent.legalCalls).toEqual([
      {
        tenantId: TENANT_ID,
        userId: CUSTOMER_ID,
        partnerId: null,
        acceptedVersionIds: ['v1', 'v2'],
        requestedLocale: 'en',
        ip: '1.2.3.4',
      },
    ]);
  });

  it('claims the promotion usage against the inserted booking', async () => {
    const { useCase, reservations } = harness({
      promo: {
        promotionId: 'promo-1',
        promoCode: 'SALE',
        discountAmount: 50_000n,
        // The daily quote is one night at 500,000 ₫.
        finalAmount: 450_000n,
        usageLimitPerCustomer: 1,
        snapshot: { fundedBy: 'tenant' },
      },
    });

    await useCase.execute(HOST, dailyInput({ promoCode: 'SALE' }), ctx);

    expect(reservations).toEqual([
      {
        promotionId: 'promo-1',
        bookingId: 'booking-1',
        customerId: CUSTOMER_ID,
        discountAmount: 50_000n,
        usageLimitPerCustomer: 1,
      },
    ]);
  });

  it('reserves nothing when no promotion applied', async () => {
    const { useCase, calls } = harness();

    await useCase.execute(HOST, dailyInput(), ctx);

    expect(calls).not.toContain('reservePromotion');
  });

  it('activates straight to pending_payment with a 15 minute window', async () => {
    const { useCase, transitions } = harness();

    await useCase.execute(HOST, dailyInput(), ctx);

    expect(transitions[0]).toMatchObject({
      from: 'draft',
      to: 'pending_payment',
      actor: 'system',
      expiresAt: new Date(NOW.getTime() + 15 * 60_000),
    });
  });

  it('parks a listing that needs approval in pending_approval for a day', async () => {
    const { useCase, transitions } = harness({ listing: listing({ approvalRequired: true }) });

    await useCase.execute(HOST, dailyInput(), ctx);

    expect(transitions[0]).toMatchObject({
      to: 'pending_approval',
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60_000),
    });
  });

  it('announces the booking with the status it actually reached', async () => {
    const { useCase, events } = harness({ listing: listing({ approvalRequired: true }) });

    await useCase.execute(HOST, dailyInput(), ctx);

    expect(events).toEqual([
      {
        eventType: 'booking.created',
        payload: { bookingId: 'booking-1', code: 'BK-0001', status: 'pending_approval' },
      },
    ]);
  });

  it('snapshots the resolved cancellation policy id and its frozen tiers together', async () => {
    const { useCase, drafts } = harness();

    await useCase.execute(HOST, dailyInput(), ctx);

    expect(drafts[0]).toMatchObject({
      cancellationPolicyId: 'policy-1',
      cancellationPolicySnapshot: [{ hoursBefore: 24, refundPercent: 100 }],
    });
  });
});
