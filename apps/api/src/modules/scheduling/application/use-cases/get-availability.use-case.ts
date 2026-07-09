import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AvailabilityQuery,
  AvailabilityResponse,
  DayAvailability,
  HourlyDay,
  ModeConfig,
} from '@booking/shared';
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
import { PricingService } from '../../../listing/application/services/pricing.service';
import {
  AVAILABILITY_RULE_REPOSITORY,
  type IAvailabilityRuleRepository,
} from '../../domain/ports/availability-rule-repository.port';
import {
  AVAILABILITY_EXCEPTION_REPOSITORY,
  type IAvailabilityExceptionRepository,
} from '../../domain/ports/availability-exception-repository.port';
import { BUSY_READER, type IBusyReader } from '../../domain/ports/busy-reader.port';
import { eachDate, parseDate, weekdayOf } from '../../domain/availability/date-util';
import { openWindowsForDate, type DateException } from '../../domain/availability/open-windows';
import { generateHourlySlots } from '../../domain/availability/slot-generator';
import { computeDay } from '../../domain/availability/day-availability';
import type { Interval } from '../../domain/availability/interval';

const DAY_MS = 86_400_000;

/**
 * Public availability for a listing over a date range (§9), host-resolved.
 * Computed live on every request — bookings and holds are merged into one busy
 * list so a naturally-expired hold never leaves a ghost-busy slot.
 * TODO(Task 1.7): add a measured Redis cache once bookings/holds + real traffic
 * exist and the `computeQuote`-per-slot cost is worth caching.
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
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly pricing: PricingService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, slug: string, query: AvailabilityQuery): Promise<AvailabilityResponse> {
    const tenant = await this.resolveTenant.execute(host);
    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const listing = await this.listings.findPublicBySlug(tx, slug);
      if (!listing) {
        throw new NotFoundException({ statusCode: 404, code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
      }
      if (!listing.bookingModes.includes(query.mode)) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'MODE_NOT_ENABLED',
          message: `Listing does not enable "${query.mode}"`,
        });
      }

      const tz = listing.resourceTimezone;
      const modeConfig = listing.modeConfig as ModeConfig;
      const pv = (await this.pricingRules.listByListing(tx, listing.id)).map((r) => ({
        id: r.id,
        bookingMode: r.bookingMode,
        ruleType: r.ruleType,
        params: r.params,
        price: r.price,
        priority: r.priority,
      }));
      const ruleRows = await this.rules.listByListing(tx, listing.id);
      const excRows = await this.exceptions.listByResource(tx, listing.resourceId, query.from, query.to);
      const excByDate = new Map<string, DateException>(
        excRows.map((e) => [e.date, { type: e.type, openTime: e.openTime, closeTime: e.closeTime }]),
      );

      const dayZero = (d: string) => zonedTimeToUtc({ ...parseDate(d), hour: 0, minute: 0 }, tz);
      const rangeStart = dayZero(query.from);
      const rangeEnd = new Date(dayZero(query.to).getTime() + 2 * DAY_MS);
      // Bookings + holds are one busy list: holds are always live (never cached).
      const busy: Interval[] = [
        ...(await this.busy.busyBookings(tx, listing.resourceId, rangeStart, rangeEnd)),
        ...(await this.busy.activeHolds(tx, listing.resourceId, rangeStart, rangeEnd)),
      ];

      const priceFor = (startUtc: Date, endUtc: Date): string =>
        this.pricing.quote({
          mode: query.mode,
          modeConfig,
          pricingRules: pv,
          timezone: tz,
          startUtc,
          endUtc,
          quantity: 1,
          depositPercent: listing.depositPercent,
        }).subtotal;

      const dates = eachDate(query.from, query.to);
      const now = utcNow();

      if (query.mode === 'hourly') {
        const hourly = modeConfig.hourly;
        const days = dates.map<HourlyDay>((date) => {
          const windows = openWindowsForDate(date, tz, ruleRows, excByDate.get(date));
          const slots = hourly
            ? generateHourlySlots({
                openWindows: windows,
                busy,
                now,
                granularityMin: hourly.granularity,
                minDurationHours: hourly.minDuration,
                bufferBeforeMin: listing.bufferBefore,
                bufferAfterMin: listing.bufferAfter,
                leadTimeMin: hourly.leadTimeMin,
                priceAt: priceFor,
              })
            : [];
          return {
            date,
            slots: slots.map((s) => ({
              startUtc: s.startUtc.toISOString(),
              endUtc: s.endUtc.toISOString(),
              available: s.available,
              price: s.price,
            })),
          };
        });
        return { mode: 'hourly', timezone: tz, days };
      }

      return {
        mode: 'daily',
        timezone: tz,
        days: dates.map((date) => this.daily(date, tz, modeConfig, ruleRows, excByDate.get(date), busy, priceFor)),
      };
    });
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
    const weekdayOpen = hasAnyRule ? ruleRows.some((r) => r.dayOfWeek === weekdayOf(date)) : true;
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
        { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: outH, minute: outM },
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
