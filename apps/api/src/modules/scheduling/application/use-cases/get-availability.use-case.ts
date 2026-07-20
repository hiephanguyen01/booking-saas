import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AvailabilityQuery,
  AvailabilityResponse,
  DayAvailability,
  HourlyDay,
  ModeConfig,
  SelectedPackage,
} from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow, zonedTimeToUtc } from '../../../../shared/time/time';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../../listing/domain/ports/listing-repository.port';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
} from '../../../listing/domain/ports/pricing-rule-repository.port';
import { priceQuote } from '../../../listing/application/pricing';
import {
  AVAILABILITY_RULE_REPOSITORY,
  type IAvailabilityRuleRepository,
} from '../../domain/ports/availability-rule-repository.port';
import {
  AVAILABILITY_EXCEPTION_REPOSITORY,
  type IAvailabilityExceptionRepository,
} from '../../domain/ports/availability-exception-repository.port';
import { BUSY_READER, type IBusyReader } from '../../domain/ports/busy-reader.port';
import { HOLD_READER, type IHoldReader } from '../../domain/ports/hold-reader.port';
import { eachDate, parseDate, weekdayOf } from '../../domain/availability/date-util';
import { openWindowsForDate, type DateException } from '../../domain/availability/open-windows';
import { applyLiveHolds, generateHourlySlots } from '../../domain/availability/slot-generator';
import { computeDay } from '../../domain/availability/day-availability';
import type { Interval } from '../../domain/availability/interval';
import { overlapsAny } from '../../domain/availability/interval';
import {
  AVAILABILITY_CACHE,
  type CachedSlot,
  type IAvailabilityCache,
} from '../../domain/ports/availability-cache.port';
import {
  findActivePackage,
  ListingModeConfigError,
} from '../../../listing/domain/pricing/package-config';

const DAY_MS = 86_400_000;

/**
 * Public availability for a listing over a date range (§9), host-resolved.
 * The booking/config-derived hourly slots are cached in Redis by `(listing, date)`
 * (§9.1) and invalidated by resource on booking/block changes; live holds are read
 * from Redis and merged on top every request, so a naturally-expired hold never
 * leaves a ghost-busy slot.
 */
@Injectable()
export class GetAvailabilityUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly pricingRules: IPricingRuleRepository,
    @Inject(AVAILABILITY_RULE_REPOSITORY) private readonly rules: IAvailabilityRuleRepository,
    @Inject(AVAILABILITY_EXCEPTION_REPOSITORY)
    private readonly exceptions: IAvailabilityExceptionRepository,
    @Inject(BUSY_READER) private readonly busy: IBusyReader,
    @Inject(HOLD_READER) private readonly holds: IHoldReader,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
    @Inject(AVAILABILITY_CACHE) private readonly cache: IAvailabilityCache,
  ) {}

  async execute(
    host: string,
    slug: string,
    query: AvailabilityQuery,
  ): Promise<AvailabilityResponse> {
    const tenant = await this.resolveTenant.execute(host);
    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const listing = await this.listings.findPublicBySlug(tx, slug);
      if (!listing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found',
        });
      }
      if (!listing.bookingModes.includes(query.mode)) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'MODE_NOT_ENABLED',
          message: `Listing does not enable "${query.mode}"`,
        });
      }

      const tz = listing.resourceTimezone;

      // Inventory (§9.4): remaining = stock − committed quantity over the window.
      if (query.mode === 'inventory') {
        const stock = listing.stockQuantity ?? 0;
        const from = zonedTimeToUtc({ ...parseDate(query.from), hour: 0, minute: 0 }, tz);
        const to = new Date(
          zonedTimeToUtc({ ...parseDate(query.to), hour: 0, minute: 0 }, tz).getTime() + DAY_MS,
        );
        const used = await this.busy.inventoryUsage(tx, listing.id, from, to);
        return {
          mode: 'inventory',
          timezone: tz,
          inventory: { stock, remaining: Math.max(0, stock - used) },
        };
      }

      const modeConfig = listing.modeConfig as ModeConfig;
      let selectedPackage: SelectedPackage | undefined;
      if (listing.bookingSelection === 'fixed_packages') {
        try {
          selectedPackage = findActivePackage(modeConfig, query.mode, query.packageId);
        } catch (error) {
          if (error instanceof ListingModeConfigError) {
            throw new BadRequestException({
              statusCode: 400,
              code: error.code,
              message: error.message,
            });
          }
          throw error;
        }
      }
      const pv = (await this.pricingRules.listByListing(tx, listing.id)).map((r) => ({
        id: r.id,
        bookingMode: r.bookingMode,
        ruleType: r.ruleType,
        params: r.params,
        price: r.price,
        salePrice: r.salePrice,
        priority: r.priority,
      }));
      const ruleRows = await this.rules.listByListing(tx, listing.id);
      const extensionDays = selectedPackage?.mode === 'daily' ? selectedPackage.durationDays : 0;
      const exceptionTo = addCalendarDays(query.to, extensionDays);
      const excRows = await this.exceptions.listByResource(
        tx,
        listing.resourceId,
        query.from,
        exceptionTo,
      );
      const excByDate = new Map<string, DateException>(
        excRows.map((e) => [
          e.date,
          { type: e.type, openTime: e.openTime, closeTime: e.closeTime },
        ]),
      );

      const dayZero = (d: string) => zonedTimeToUtc({ ...parseDate(d), hour: 0, minute: 0 }, tz);
      const rangeStart = dayZero(query.from);
      const rangeEnd = new Date(dayZero(exceptionTo).getTime() + 2 * DAY_MS);
      // Holds live in Redis and are never cached — read them fresh for the range
      // and merge at read time so an expired hold never leaves a ghost-busy slot.
      const liveHolds = await this.holds.activeHolds(listing.resourceId, rangeStart, rangeEnd);

      const priceFor = (startUtc: Date, endUtc: Date): string =>
        priceQuote({
          mode: query.mode,
          modeConfig,
          pricingRules: pv,
          timezone: tz,
          startUtc,
          endUtc,
          quantity: 1,
          depositPercent: listing.depositPercent,
          bookingSelection: listing.bookingSelection,
          packageId: query.packageId,
        }).subtotal;

      const dates = eachDate(query.from, query.to);
      const now = utcNow();

      if (query.mode === 'hourly') {
        const hourly = modeConfig.hourly;
        const selectionKey = selectedPackage?.id ?? 'flexible';
        // Booking-derived busy is resource-scoped; fetch it once, lazily, only
        // when some date misses the cache.
        let bookingBusy: Interval[] | null = null;
        const days: HourlyDay[] = [];
        for (const date of dates) {
          let cached = hourly ? await this.cache.get(listing.id, date, selectionKey) : [];
          if (hourly && cached === null) {
            bookingBusy ??= await this.busy.busyBookings(
              tx,
              listing.resourceId,
              rangeStart,
              rangeEnd,
            );
            const windows = openWindowsForDate(date, tz, ruleRows, excByDate.get(date));
            const generated = generateHourlySlots({
              openWindows: windows,
              busy: bookingBusy,
              now,
              granularityMin: hourly.granularity,
              minDurationHours:
                selectedPackage?.mode === 'hourly'
                  ? selectedPackage.durationMinutes / 60
                  : (hourly.minDuration ?? 1),
              maxDurationHours:
                selectedPackage?.mode === 'hourly'
                  ? selectedPackage.durationMinutes / 60
                  : (hourly.maxDuration ?? hourly.minDuration ?? 1),
              bufferBeforeMin: listing.bufferBefore,
              bufferAfterMin: listing.bufferAfter,
              leadTimeMin: hourly.leadTimeMin,
              priceAt: priceFor,
            });
            cached = generated.map<CachedSlot>((s) => ({
              startUtc: s.startUtc.toISOString(),
              endUtc: s.endUtc.toISOString(),
              available: s.available,
              price: s.price,
            }));
            await this.cache.set(listing.resourceId, listing.id, date, selectionKey, cached);
          }
          // Merge live holds on top of the cached booking/config-derived slots.
          const merged = applyLiveHolds(
            (cached ?? []).map((s) => ({
              startUtc: new Date(s.startUtc),
              endUtc: new Date(s.endUtc),
              available: s.available,
              price: s.price,
            })),
            {
              bufferBeforeMin: listing.bufferBefore,
              bufferAfterMin: listing.bufferAfter,
              holds: liveHolds,
            },
          );
          days.push({
            date,
            slots: merged.map((s) => ({
              startUtc: s.startUtc.toISOString(),
              endUtc: s.endUtc.toISOString(),
              available: s.available,
              price: s.price,
            })),
          });
        }
        return { mode: 'hourly', timezone: tz, days };
      }

      // Daily is one price per day (cheap) → computed live, holds included directly.
      const dailyBusy: Interval[] = [
        ...(await this.busy.busyBookings(tx, listing.resourceId, rangeStart, rangeEnd)),
        ...liveHolds,
      ];
      if (selectedPackage?.mode === 'daily') {
        const daily = modeConfig.daily;
        if (!daily) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'MODE_CONFIG_MISSING',
            message: 'No daily config on this listing',
          });
        }
        return {
          mode: 'daily',
          timezone: tz,
          days: dates.map((date) =>
            this.fixedDaily(
              date,
              selectedPackage!.durationDays,
              tz,
              daily,
              ruleRows,
              excByDate,
              dailyBusy,
              priceFor,
            ),
          ),
        };
      }
      return {
        mode: 'daily',
        timezone: tz,
        days: dates.map((date) =>
          this.daily(date, tz, modeConfig, ruleRows, excByDate.get(date), dailyBusy, priceFor),
        ),
      };
    });
  }

  private fixedDaily(
    date: string,
    durationDays: number,
    tz: string,
    daily: NonNullable<ModeConfig['daily']>,
    ruleRows: { dayOfWeek: number }[],
    exceptions: Map<string, DateException>,
    busy: Interval[],
    priceFor: (s: Date, e: Date) => string,
  ): DayAvailability {
    const stayDates = Array.from({ length: durationDays }, (_, index) =>
      addCalendarDays(date, index),
    );
    let blocked = false;
    const open = stayDates.every((stayDate) => {
      const exception = exceptions.get(stayDate);
      if (exception?.type === 'closed') {
        blocked = true;
        return false;
      }
      return (
        exception?.type === 'custom_hours' ||
        ruleRows.length === 0 ||
        ruleRows.some((rule) => rule.dayOfWeek === weekdayOf(stayDate))
      );
    });
    if (!open) return { date, status: blocked ? 'blocked' : 'closed', price: null };

    const startParts = parseDate(date);
    const endParts = parseDate(addCalendarDays(date, durationDays));
    const [inH, inM] = daily.checkinTime.split(':').map(Number);
    const [outH, outM] = daily.checkoutTime.split(':').map(Number);
    const start = zonedTimeToUtc({ ...startParts, hour: inH, minute: inM }, tz);
    const end = zonedTimeToUtc({ ...endParts, hour: outH, minute: outM }, tz);
    const price = priceFor(start, end);
    return {
      date,
      status: overlapsAny({ start, end }, busy) ? 'booked' : 'available',
      price,
    };
  }

  private daily(
    date: string,
    tz: string,
    modeConfig: ModeConfig,
    ruleRows: { dayOfWeek: number }[],
    exception: DateException | undefined,
    busy: Interval[],
    priceFor: (s: Date, e: Date) => string,
  ): DayAvailability {
    const daily = modeConfig.daily;
    const hasAnyRule = ruleRows.length > 0;
    const weekdayOpen =
      exception?.type === 'custom_hours' ||
      (hasAnyRule ? ruleRows.some((r) => r.dayOfWeek === weekdayOf(date)) : true);
    const closedByException = exception?.type === 'closed';

    let night: Interval | null = null;
    let price: string | null = null;
    if (daily && weekdayOpen && !closedByException) {
      const { year, month, day } = parseDate(date);
      const [inH, inM] = daily.checkinTime.split(':').map(Number);
      const [outH, outM] = daily.checkoutTime.split(':').map(Number);
      const checkin = zonedTimeToUtc({ year, month, day, hour: inH, minute: inM }, tz);
      const next = new Date(Date.UTC(year, month - 1, day) + DAY_MS);
      const checkout = zonedTimeToUtc(
        {
          year: next.getUTCFullYear(),
          month: next.getUTCMonth() + 1,
          day: next.getUTCDate(),
          hour: outH,
          minute: outM,
        },
        tz,
      );
      night = { start: checkin, end: checkout };
      price = priceFor(checkin, checkout);
    }

    const computed = computeDay({
      openWindows: night ? [night] : [],
      closedByException,
      night,
      busy,
      price,
    });
    return { date, status: computed.status, price: computed.price };
  }
}

function addCalendarDays(date: string, days: number): string {
  const value = parseDate(date);
  return new Date(Date.UTC(value.year, value.month - 1, value.day + days))
    .toISOString()
    .slice(0, 10);
}
