import { Inject, Injectable } from '@nestjs/common';
import {
  modeConfigSchema,
  type AttributeField,
  type BookingMode,
  type ListingTypeSearchAttributeFacet,
  type ModeConfig,
  type PublicCatalogFacet,
  type PublicCatalogSearchItem,
  type PublicCatalogSearchQuery,
  type PublicCatalogSearchResponse,
} from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { addMinutes, zonedTimeToUtc } from '../../../../shared/time/time';
import { toVnd } from '../../../../shared/money/money';
import { pageOffset } from '../../../../shared/pagination/pagination';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { computeQuote } from '../../../../shared/domain/pricing/quote-calculator';
import { activePackages } from '../../../../shared/domain/pricing/package-config';
import { parseDate, weekdayOf } from '../../../../shared/domain/availability/date-util';
import {
  contains,
  overlapsAny,
  type Interval,
} from '../../../../shared/domain/availability/interval';
import { openWindowsForDate } from '../../../../shared/domain/availability/open-windows';
import { listingGroupAmenityLabels } from '../../../../shared/domain/listing-group-amenities';
import { toPublicListingTypeResponse } from '../catalog.mapper';
import { HOLD_READER, type IHoldReader } from '../../domain/ports/hold-reader.port';
import {
  LISTING_READ_REPOSITORY,
  type IListingReadRepository,
  type PublicListingRecord,
} from '../../domain/ports/listing-read-repository.port';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
  type ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';
import {
  CatalogAttributeFilterInvalid,
  CatalogDateFilterDisabled,
  CatalogListingTypeNotFound,
  CatalogModeNotAllowed,
  CatalogScheduleQueryInvalid,
} from '../catalog-search-http-errors';

const DAY_MS = 86_400_000;

interface EvaluatedListing {
  listing: PublicListingRecord;
  price: bigint;
  regularPrice: bigint;
  priceUnit: 'hour' | 'day' | 'item' | 'session' | 'package';
}

interface SearchWindow {
  mode: 'hourly' | 'daily' | 'inventory';
  start: Date;
  end: Date;
}

@Injectable()
export class SearchPublicCatalogUseCase {
  constructor(
    @Inject(LISTING_READ_REPOSITORY) private readonly listings: IListingReadRepository,
    @Inject(LISTING_TYPE_REPOSITORY) private readonly listingTypes: IListingTypeRepository,
    @Inject(HOLD_READER) private readonly holdReader: IHoldReader,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    query: PublicCatalogSearchQuery,
  ): Promise<PublicCatalogSearchResponse> {
    const tenant = await this.resolveTenant.execute(host);
    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const type = await this.listingTypes.findBySlug(tx, query.type);
      if (!type?.isActive) throw new CatalogListingTypeNotFound();

      const mode = this.resolveMode(type, query);
      this.validateAttributeFilters(type, query);
      this.validateScheduleQuery(type, mode, query);

      const candidates = await this.listings.findPublished(tx, {
        typeSlug: type.slug,
        partnerSlug: query.partner,
        q: query.q || undefined,
        attrFilters: {},
        exceptionFrom:
          query.date || query.from
            ? new Date(`${query.date ?? query.from}T00:00:00.000Z`)
            : undefined,
        exceptionTo:
          query.date || query.to ? new Date(`${query.date ?? query.to}T00:00:00.000Z`) : undefined,
      });
      const facetQuery: PublicCatalogSearchQuery = {
        ...query,
        location: [],
        amenities: [],
        minPrice: undefined,
        maxPrice: undefined,
        attributes: {},
        attributeRanges: {},
      };
      const facetCandidates = candidates.filter((listing) =>
        this.matchesStatic(listing, type, facetQuery, mode),
      );
      const window = this.searchWindow(facetCandidates, mode, query);
      const resourceIds = [...new Set(facetCandidates.map((l) => l.resourceId))];
      const listingIds = facetCandidates.map((l) => l.id);
      const busyRows =
        window && mode !== 'inventory'
          ? await this.listings.busyRanges(tx, resourceIds, window.start, window.end)
          : [];
      const inventoryRows =
        window && mode === 'inventory'
          ? await this.listings.inventoryUsage(tx, listingIds, window.start, window.end)
          : [];
      const holds =
        window && mode !== 'inventory'
          ? await this.holdReader.activeHoldsByResource(resourceIds, window.start, window.end)
          : new Map<string, Interval[]>();
      const busy = groupIntervals(
        busyRows.map((r) => ({ key: r.resourceId, interval: { start: r.start, end: r.end } })),
      );
      const inventoryUsed = new Map(inventoryRows.map((r) => [r.listingId, r.used]));

      const facetRows: EvaluatedListing[] = [];
      for (const listing of facetCandidates) {
        const result = this.evaluate(
          listing,
          mode,
          query,
          busy.get(listing.resourceId) ?? [],
          holds.get(listing.resourceId) ?? [],
          inventoryUsed.get(listing.id) ?? 0,
        );
        if (result) facetRows.push(result);
      }

      const evaluated = facetRows.filter((row) =>
        this.matchesStatic(row.listing, type, query, mode),
      );

      const grouped = this.toCards(evaluated);
      const rated = grouped.filter(
        (item) => query.minRating === undefined || (item.ratingAvg ?? 0) >= query.minRating,
      );
      const priced = rated.filter((item) => {
        const price = BigInt(item.priceFrom);
        return (
          (!query.minPrice || price >= BigInt(query.minPrice)) &&
          (!query.maxPrice || price <= BigInt(query.maxPrice))
        );
      });
      const sorted = this.sort(priced, query.sort);
      const total = sorted.length;
      const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
      const page = Math.min(query.page, totalPages);
      // Paged in memory: availability + price are evaluated per candidate after
      // the DB query, so the window can only be applied once ranking is done.
      const { skip, take } = pageOffset({ page, pageSize: query.pageSize });

      return {
        type: toPublicListingTypeResponse(type),
        applied: { ...query, mode, page },
        items: sorted.slice(skip, skip + take),
        facets: this.facets(type, facetRows),
        sortOptions: ['relevance', 'bookings-desc', 'price-asc'],
        pagination: { page, pageSize: query.pageSize, total, totalPages },
      };
    });
  }

  private resolveMode(type: ListingTypeRecord, query: PublicCatalogSearchQuery) {
    const schedule = type.searchConfig.schedule;
    const mode = query.mode ?? (schedule === 'none' ? undefined : schedule);
    if (mode && !type.allowedModes.includes(mode as BookingMode)) {
      throw new CatalogModeNotAllowed(mode);
    }
    return mode;
  }

  private validateScheduleQuery(
    type: ListingTypeRecord,
    mode: 'hourly' | 'daily' | 'inventory' | undefined,
    query: PublicCatalogSearchQuery,
  ) {
    const hasHourly = Boolean(query.date || query.startTime || query.endTime);
    const hasRange = Boolean(query.from || query.to);
    if (!mode && (hasHourly || hasRange)) {
      throw new CatalogDateFilterDisabled();
    }
    if (mode === 'hourly' && hasRange)
      throw new CatalogScheduleQueryInvalid('Hourly search uses date, startTime and endTime');
    if (
      (mode === 'daily' || mode === 'inventory') &&
      hasHourly &&
      !(
        mode === 'daily' &&
        type.bookingSelection === 'fixed_packages' &&
        query.date &&
        !query.startTime &&
        !query.endTime
      )
    ) {
      throw new CatalogScheduleQueryInvalid('Daily and inventory search use from and to');
    }
  }

  private validateAttributeFilters(type: ListingTypeRecord, query: PublicCatalogSearchQuery) {
    const allowed = new Map(
      type.attributeSchema.filter((f) => f.filterable).map((f) => [f.key, f]),
    );
    for (const key of [...Object.keys(query.attributes), ...Object.keys(query.attributeRanges)]) {
      if (!allowed.has(key)) throw new CatalogAttributeFilterInvalid(key);
    }
  }

  private matchesStatic(
    listing: PublicListingRecord,
    type: ListingTypeRecord,
    query: PublicCatalogSearchQuery,
    mode: 'hourly' | 'daily' | 'inventory' | undefined,
  ): boolean {
    if (mode && !listing.bookingModes.includes(mode as BookingMode)) return false;
    if (query.guests > 1 && (listing.capacity ?? 0) < query.guests) return false;
    const province = listing.group?.provinceCode ?? listing.provinceCode;
    const ward = listing.group?.wardCode ?? listing.wardCode;
    const locationText = normalize(
      [
        listing.group?.address ?? listing.address,
        listing.group?.wardName ?? listing.wardName,
        listing.group?.provinceName ?? listing.provinceName,
      ]
        .filter(Boolean)
        .join(' '),
    );
    if (
      query.location.length &&
      !query.location.some(
        (value) => value === province || value === ward || locationText.includes(normalize(value)),
      )
    )
      return false;
    const amenities = listingGroupAmenityLabels(listing.group?.amenities).map(normalize);
    if (query.amenities.length && !query.amenities.every((a) => amenities.includes(normalize(a))))
      return false;

    const fields = new Map(type.attributeSchema.map((f) => [f.key, f]));
    const configs = new Map(type.searchConfig.attributeFacets.map((f) => [f.key, f]));
    for (const [key, values] of Object.entries(query.attributes)) {
      if (!matchesAttribute(listing.attributes[key], values, fields.get(key), configs.get(key)))
        return false;
    }
    for (const [key, range] of Object.entries(query.attributeRanges)) {
      const value = Number(listing.attributes[key]);
      if (
        !Number.isFinite(value) ||
        (range.min !== undefined && value < range.min) ||
        (range.max !== undefined && value > range.max)
      )
        return false;
    }
    return true;
  }

  private searchWindow(
    listings: PublicListingRecord[],
    mode: 'hourly' | 'daily' | 'inventory' | undefined,
    query: PublicCatalogSearchQuery,
  ): SearchWindow | null {
    if (!mode || !listings.length) return null;
    const tz = listings[0]!.resourceTimezone;
    if (mode === 'hourly' && query.date) {
      return {
        mode,
        start: localInstant(query.date, query.startTime ?? '00:00', tz),
        end: query.endTime
          ? localInstant(query.date, query.endTime, tz)
          : localInstant(nextDate(query.date), '00:00', tz),
      };
    }
    if (mode === 'daily' && query.date && listings[0]?.bookingSelection === 'fixed_packages') {
      const maxDays = Math.max(
        1,
        ...listings.flatMap((listing) => {
          const config = parseModeConfig(listing.modeConfig);
          return config ? activePackages(config, 'daily').map((item) => item.durationDays) : [];
        }),
      );
      return {
        mode,
        start: localInstant(query.date, '00:00', tz),
        end: localInstant(addDateDays(query.date, maxDays + 1), '00:00', tz),
      };
    }
    if ((mode === 'daily' || mode === 'inventory') && query.from && query.to) {
      return {
        mode,
        start: localInstant(query.from, '00:00', tz),
        end: localInstant(query.to, '00:00', tz),
      };
    }
    return null;
  }

  private evaluate(
    listing: PublicListingRecord,
    mode: 'hourly' | 'daily' | 'inventory' | undefined,
    query: PublicCatalogSearchQuery,
    busy: Interval[],
    holds: Interval[],
    inventoryUsed: number,
  ): EvaluatedListing | null {
    if (!mode) return configuredRawPrice(listing);
    const config = parseModeConfig(listing.modeConfig);
    if (!config) return null;
    if (mode === 'daily' && listing.bookingSelection === 'fixed_packages' && query.date) {
      return this.evaluateFixedDailyDate(listing, config, query.date, busy, holds);
    }
    const hasExplicitWindow = mode === 'hourly' ? Boolean(query.date) : Boolean(query.from);
    if (!hasExplicitWindow) return configuredPrice(listing, config, mode);

    const tz = listing.resourceTimezone;
    let start: Date;
    let end: Date;
    let packageId: string | undefined;
    if (mode === 'hourly') {
      const hourly = config.hourly;
      if (!hourly || !query.date) return null;
      if (!query.startTime || !query.endTime) {
        return this.evaluateHourlyDate(listing, config, query.date, busy, holds);
      }
      start = localInstant(query.date, query.startTime, tz);
      end = localInstant(query.date, query.endTime, tz);
      const minutes = (end.getTime() - start.getTime()) / 60_000;
      if (listing.bookingSelection === 'fixed_packages') {
        const selected = activePackages(config, 'hourly')
          .filter((item) => item.durationMinutes === minutes)
          .sort((left, right) => (BigInt(left.price) < BigInt(right.price) ? -1 : 1))[0];
        if (!selected) return null;
        packageId = selected.id;
      } else if (
        hourly.minDuration === undefined ||
        hourly.maxDuration === undefined ||
        minutes < hourly.minDuration * 60 ||
        minutes > hourly.maxDuration * 60 ||
        minutes % hourly.granularity !== 0
      ) {
        return null;
      }
      if (start.getTime() < Date.now() + hourly.leadTimeMin * 60_000) return null;
      const exception = listing.availabilityExceptions.find((e) => e.date === query.date);
      const windows = openWindowsForDate(query.date, tz, listing.availabilityRules, exception);
      if (!windows.some((window) => contains(window, { start, end }))) return null;
    } else {
      if (!query.from || !query.to) return null;
      const daily = config.daily;
      const inventory = config.inventory;
      if (mode === 'daily' && !daily) return null;
      if (mode === 'inventory' && !inventory) return null;
      const dates = dateRange(query.from, query.to);
      const duration = dates.length;
      if (mode === 'daily' && listing.bookingSelection === 'fixed_packages') {
        const selected = activePackages(config, 'daily')
          .filter((item) => item.durationDays === duration)
          .sort((left, right) => (BigInt(left.price) < BigInt(right.price) ? -1 : 1))[0];
        if (!selected) return null;
        packageId = selected.id;
      } else {
        const min = mode === 'daily' ? daily!.minNights : (inventory!.minDuration ?? 1);
        const max =
          mode === 'daily' ? daily!.maxNights : (inventory!.maxDuration ?? Number.MAX_SAFE_INTEGER);
        if (min === undefined || max === undefined || duration < min || duration > max) return null;
      }
      if (mode === 'daily') {
        if (!dates.every((date) => this.openDaily(listing, date))) return null;
        start = localInstant(query.from, daily!.checkinTime, tz);
        end = localInstant(query.to, daily!.checkoutTime, tz);
      } else {
        start = localInstant(query.from, '00:00', tz);
        end = localInstant(query.to, '00:00', tz);
        if ((listing.stockQuantity ?? 0) - inventoryUsed < query.quantity) return null;
      }
    }

    const blocked = {
      start: addMinutes(start, -listing.bufferBefore),
      end: addMinutes(end, listing.bufferAfter),
    };
    if (mode !== 'inventory' && overlapsAny(blocked, [...busy, ...holds])) return null;
    try {
      const quote = computeQuote({
        mode,
        modeConfig: config,
        pricingRules: listing.pricingRules,
        timezone: tz,
        startUtc: start,
        endUtc: end,
        quantity: mode === 'inventory' ? query.quantity : 1,
        depositPercent: listing.depositPercent,
        bookingSelection: listing.bookingSelection,
        packageId,
      });
      return {
        listing,
        price: quote.subtotal,
        regularPrice: quote.regularSubtotal,
        priceUnit:
          listing.bookingSelection === 'fixed_packages' ? 'package' : unitFor(mode, config),
      };
    } catch {
      return null;
    }
  }

  private evaluateFixedDailyDate(
    listing: PublicListingRecord,
    config: ModeConfig,
    date: string,
    busy: Interval[],
    holds: Interval[],
  ): EvaluatedListing | null {
    const daily = config.daily;
    if (!daily) return null;
    let cheapest: EvaluatedListing | null = null;
    for (const selected of activePackages(config, 'daily')) {
      const endDate = addDateDays(date, selected.durationDays);
      const dates = dateRange(date, endDate);
      if (!dates.every((day) => this.openDaily(listing, day))) continue;
      const start = localInstant(date, daily.checkinTime, listing.resourceTimezone);
      const end = localInstant(endDate, daily.checkoutTime, listing.resourceTimezone);
      const blocked = {
        start: addMinutes(start, -listing.bufferBefore),
        end: addMinutes(end, listing.bufferAfter),
      };
      if (overlapsAny(blocked, [...busy, ...holds])) continue;
      try {
        const quote = computeQuote({
          mode: 'daily',
          modeConfig: config,
          pricingRules: listing.pricingRules,
          timezone: listing.resourceTimezone,
          startUtc: start,
          endUtc: end,
          quantity: 1,
          depositPercent: listing.depositPercent,
          bookingSelection: listing.bookingSelection,
          packageId: selected.id,
        });
        if (!cheapest || quote.subtotal < cheapest.price) {
          cheapest = {
            listing,
            price: quote.subtotal,
            regularPrice: quote.regularSubtotal,
            priceUnit: 'package',
          };
        }
      } catch {
        continue;
      }
    }
    return cheapest;
  }

  private evaluateHourlyDate(
    listing: PublicListingRecord,
    config: ModeConfig,
    date: string,
    busy: Interval[],
    holds: Interval[],
  ): EvaluatedListing | null {
    const hourly = config.hourly;
    if (!hourly) return null;
    const exception = listing.availabilityExceptions.find((item) => item.date === date);
    const windows = openWindowsForDate(
      date,
      listing.resourceTimezone,
      listing.availabilityRules,
      exception,
    );
    const candidates =
      listing.bookingSelection === 'fixed_packages'
        ? activePackages(config, 'hourly').map((item) => ({
            durationMinutes: item.durationMinutes,
            packageId: item.id,
          }))
        : hourly.minDuration === undefined
          ? []
          : [{ durationMinutes: hourly.minDuration * 60, packageId: undefined }];
    const earliestStart = Date.now() + hourly.leadTimeMin * 60_000;
    let cheapest: { price: bigint; regularPrice: bigint } | null = null;

    for (const window of windows) {
      for (const candidate of candidates) {
        const lastStart = addMinutes(window.end, -candidate.durationMinutes);
        for (
          let start = new Date(window.start);
          start <= lastStart;
          start = addMinutes(start, hourly.granularity)
        ) {
          if (start.getTime() < earliestStart) continue;
          const end = addMinutes(start, candidate.durationMinutes);
          const blocked = {
            start: addMinutes(start, -listing.bufferBefore),
            end: addMinutes(end, listing.bufferAfter),
          };
          if (overlapsAny(blocked, [...busy, ...holds])) continue;
          try {
            const quote = computeQuote({
              mode: 'hourly',
              modeConfig: config,
              pricingRules: listing.pricingRules,
              timezone: listing.resourceTimezone,
              startUtc: start,
              endUtc: end,
              quantity: 1,
              depositPercent: listing.depositPercent,
              bookingSelection: listing.bookingSelection,
              packageId: candidate.packageId,
            });
            if (cheapest === null || quote.subtotal < cheapest.price) {
              cheapest = { price: quote.subtotal, regularPrice: quote.regularSubtotal };
            }
          } catch {
            continue;
          }
        }
      }
    }

    return cheapest === null
      ? null
      : {
          listing,
          price: cheapest.price,
          regularPrice: cheapest.regularPrice,
          priceUnit: listing.bookingSelection === 'fixed_packages' ? 'package' : 'hour',
        };
  }

  private openDaily(listing: PublicListingRecord, date: string): boolean {
    const exception = listing.availabilityExceptions.find((e) => e.date === date);
    if (exception?.type === 'closed') return false;
    if (exception?.type === 'custom_hours') return true;
    return (
      listing.availabilityRules.length === 0 ||
      listing.availabilityRules.some((r) => r.dayOfWeek === weekdayOf(date))
    );
  }

  private toCards(rows: EvaluatedListing[]): PublicCatalogSearchItem[] {
    const buckets = new Map<string, EvaluatedListing[]>();
    for (const row of rows) {
      const key = row.listing.group ? `g:${row.listing.group.id}` : `l:${row.listing.id}`;
      buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }
    return [...buckets.values()].map((matches) => {
      const cheapest = matches.reduce((a, b) => (b.price < a.price ? b : a));
      const l = cheapest.listing;
      const g = l.group;
      return {
        id: g?.id ?? l.id,
        kind: g ? 'group' : 'listing',
        title: g?.title ?? l.title,
        slug: g?.slug ?? l.slug,
        listingTypeSlug: l.listingTypeSlug,
        partnerSlug: l.partnerSlug,
        photos: stringArrayRaw(g?.photos ?? l.photos),
        address: g?.address ?? l.address,
        provinceCode: g?.provinceCode ?? l.provinceCode,
        provinceName: g?.provinceName ?? l.provinceName,
        wardCode: g?.wardCode ?? l.wardCode,
        wardName: g?.wardName ?? l.wardName,
        amenities: listingGroupAmenityLabels(g?.amenities),
        ratingAvg: g?.ratingAvg ?? l.ratingAvg,
        reviewCount: g?.reviewCount ?? l.reviewCount,
        priceFrom: cheapest.price.toString(),
        regularPriceFrom: cheapest.regularPrice.toString(),
        priceUnit: cheapest.priceUnit,
        completedBookings: matches.reduce((sum, row) => sum + row.listing.completedBookings, 0),
        matchingRoomCount: matches.length,
        rooms: matches.slice(0, 6).map((row) => ({
          slug: row.listing.slug,
          title: row.listing.title,
          price: row.price.toString(),
          capacity: row.listing.capacity,
        })),
      };
    });
  }

  private sort(items: PublicCatalogSearchItem[], sort: PublicCatalogSearchQuery['sort']) {
    return [...items].sort((a, b) => {
      if (sort === 'bookings-desc')
        return b.completedBookings - a.completedBookings || a.title.localeCompare(b.title);
      if (sort === 'price-asc') return compareBigInt(BigInt(a.priceFrom), BigInt(b.priceFrom));
      return 0;
    });
  }

  private facets(type: ListingTypeRecord, rows: EvaluatedListing[]): PublicCatalogFacet[] {
    const facets: PublicCatalogFacet[] = [];
    const cards = uniqueListingsByCard(rows);
    for (const systemFacet of type.searchConfig.systemFacets) {
      if (systemFacet === 'price') {
        if (rows.length)
          facets.push({
            key: 'price',
            label: 'Khoảng giá',
            control: 'range',
            options: [],
            icon: null,
          });
      } else if (systemFacet === 'location') {
        facets.push(
          optionFacet(
            'location',
            'Khu vực',
            cards.map((l) => [l.group?.wardCode ?? l.wardCode, l.group?.wardName ?? l.wardName]),
          ),
        );
      } else {
        facets.push(
          optionFacet(
            'amenities',
            'Tiện ích',
            cards.flatMap((l) =>
              listingGroupAmenityLabels(l.group?.amenities).map(
                (amenity) => [amenity, amenity] as [string, string],
              ),
            ),
          ),
        );
      }
    }
    const fields = new Map(type.attributeSchema.map((field) => [field.key, field]));
    for (const config of type.searchConfig.attributeFacets) {
      const field = fields.get(config.key);
      if (!field) continue;
      if (config.control === 'range') {
        const values = cards.map((l) => Number(l.attributes[config.key])).filter(Number.isFinite);
        facets.push({
          key: `attr.${config.key}`,
          label: field.label,
          control: 'range',
          options: [],
          icon: field.icon ?? null,
          ...(values.length ? { min: Math.min(...values), max: Math.max(...values) } : {}),
        });
      } else {
        const pairs =
          config.control === 'buckets'
            ? cards.flatMap((listing) =>
                (config.buckets ?? []).flatMap((bucket) => {
                  const value = Number(listing.attributes[config.key]);
                  const matches =
                    Number.isFinite(value) &&
                    (bucket.min === undefined || value >= bucket.min) &&
                    (bucket.max === undefined || value < bucket.max);
                  return matches ? [[bucket.id, bucket.label] as [string, string]] : [];
                }),
              )
            : cards.flatMap((l) =>
                rawValues(l.attributes[config.key]).map(
                  (v) => [v, optionLabel(field, v)] as [string, string],
                ),
              );
        facets.push(
          optionFacet(`attr.${config.key}`, field.label, pairs, config.control, field.icon ?? null),
        );
      }
    }
    return facets;
  }
}

function parseModeConfig(raw: Record<string, unknown>): ModeConfig | null {
  const normalizePrice = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  const copy = structuredClone(raw) as Record<string, Record<string, unknown>>;
  for (const config of Object.values(copy)) {
    if (!config || typeof config !== 'object') continue;
    for (const key of ['basePrice', 'basePricePerNight', 'securityDeposit', 'lateFeePerUnit'])
      config[key] = normalizePrice(config[key]);
    if (Array.isArray(config.packages))
      config.packages = config.packages.map((item) => ({
        ...item,
        price: normalizePrice(item.price),
      }));
  }
  const parsed = modeConfigSchema.safeParse(copy);
  return parsed.success ? parsed.data : null;
}

function configuredPrice(
  listing: PublicListingRecord,
  config: ModeConfig,
  preferred?: BookingMode,
): EvaluatedListing | null {
  const modes = preferred ? [preferred] : listing.bookingModes;
  if (listing.bookingSelection === 'fixed_packages') {
    const packages = modes.flatMap((mode) =>
      mode === 'hourly' || mode === 'daily' ? activePackages(config, mode) : [],
    );
    if (!packages.length) return null;
    const cheapest = packages.reduce((left, right) =>
      BigInt(right.price) < BigInt(left.price) ? right : left,
    );
    const price = BigInt(cheapest.price);
    return { listing, price, regularPrice: price, priceUnit: 'package' };
  }
  const prices = modes.flatMap((mode) => {
    const c = config[mode as keyof ModeConfig] as Record<string, unknown> | undefined;
    const raw = c?.basePrice ?? c?.basePricePerNight;
    return typeof raw === 'string' && /^\d+$/.test(raw) ? [{ mode, price: BigInt(raw) }] : [];
  });
  if (!prices.length) return null;
  const cheapest = prices.reduce((a, b) => (b.price < a.price ? b : a));
  return {
    listing,
    price: cheapest.price,
    regularPrice: cheapest.price,
    priceUnit: unitFor(cheapest.mode, config),
  };
}

function configuredRawPrice(listing: PublicListingRecord): EvaluatedListing | null {
  const parsed = parseModeConfig(listing.modeConfig);
  if (!parsed) return null;
  if (listing.bookingSelection === 'fixed_packages') {
    return configuredPrice(listing, parsed);
  }
  const prices = listing.bookingModes.flatMap((mode) => {
    const config = listing.modeConfig[mode];
    if (!config || typeof config !== 'object') return [];
    const raw =
      (config as Record<string, unknown>).basePrice ??
      (config as Record<string, unknown>).basePricePerNight;
    const price = toVnd(raw);
    return price === null ? [] : [{ mode, price }];
  });
  if (!prices.length) return null;
  const cheapest = prices.reduce((a, b) => (b.price < a.price ? b : a));
  return {
    listing,
    price: cheapest.price,
    regularPrice: cheapest.price,
    priceUnit:
      cheapest.mode === 'daily'
        ? 'day'
        : cheapest.mode === 'hourly'
          ? 'hour'
          : cheapest.mode === 'inventory'
            ? 'item'
            : 'session',
  };
}

function unitFor(
  mode: BookingMode,
  config: ModeConfig,
): 'hour' | 'day' | 'item' | 'session' | 'package' {
  if (mode === 'daily') return 'day';
  if (mode === 'inventory') return config.inventory?.unit === 'day' ? 'day' : 'item';
  return mode === 'hourly' ? 'hour' : 'session';
}

function matchesAttribute(
  raw: unknown,
  selected: string[],
  field?: AttributeField,
  config?: ListingTypeSearchAttributeFacet,
): boolean {
  if (!selected.length) return true;
  if (config?.control === 'buckets') {
    const value = Number(raw);
    return selected.some((id) => {
      const bucket = config.buckets?.find((b) => b.id === id);
      return (
        bucket &&
        Number.isFinite(value) &&
        (bucket.min === undefined || value >= bucket.min) &&
        (bucket.max === undefined || value < bucket.max)
      );
    });
  }
  const actual = rawValues(raw).map(normalize);
  const wanted = selected.map(normalize);
  if (field?.type === 'boolean') return wanted.includes(String(Boolean(raw)));
  return config?.matchAll
    ? wanted.every((v) => actual.includes(v))
    : wanted.some((v) => actual.includes(v));
}

function localInstant(date: string, time: string, timezone: string): Date {
  const { year, month, day } = parseDate(date);
  const [hour, minute] = time.split(':').map(Number);
  return zonedTimeToUtc({ year, month, day, hour, minute }, timezone);
}

function dateRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const dates: string[] = [];
  for (let cursor = start; cursor < end; cursor += DAY_MS)
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  return dates;
}

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

function addDateDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function rawValues(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.flatMap(rawValues);
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean')
    return [String(raw)];
  return [];
}

function stringArrayRaw(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('vi');
}
function compareBigInt(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function groupIntervals(rows: Array<{ key: string; interval: Interval }>): Map<string, Interval[]> {
  const grouped = new Map<string, Interval[]>();
  for (const row of rows) grouped.set(row.key, [...(grouped.get(row.key) ?? []), row.interval]);
  return grouped;
}

function uniqueListingsByCard(rows: EvaluatedListing[]): PublicListingRecord[] {
  const cards = new Map<string, PublicListingRecord>();
  for (const row of rows) cards.set(row.listing.group?.id ?? row.listing.id, row.listing);
  return [...cards.values()];
}

function optionFacet(
  key: string,
  label: string,
  pairs: Array<[string | null | undefined, string | null | undefined]>,
  control: 'checkbox' | 'radio' | 'buckets' = 'checkbox',
  icon: string | null = null,
): PublicCatalogFacet {
  const counts = new Map<string, { label: string; count: number }>();
  for (const [value, option] of pairs) {
    if (!value || !option) continue;
    const current = counts.get(value);
    counts.set(value, { label: option, count: (current?.count ?? 0) + 1 });
  }
  return {
    key,
    label,
    control,
    icon,
    options: [...counts].map(([value, item]) => ({ value, ...item })),
  };
}

function optionLabel(field: AttributeField, value: string): string {
  if ('options' in field && field.options)
    return field.options.find((option) => option === value) ?? value;
  return value === 'true' ? field.label : value;
}
