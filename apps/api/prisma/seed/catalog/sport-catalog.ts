import type { Prisma, PrismaClient } from '@prisma/client';
import { listingTypeSearchConfigSchema, modeConfigSchema } from '@booking/contracts';
import {
  cycle,
  ensureWeeklyRules,
  LOCATIONS,
  photosFor,
  upsertCategory,
  upsertListing,
  upsertListingType,
  type CatalogDefinition,
  type CatalogTypes,
  type LocationFixture,
} from './studio-catalog';

/**
 * Sport-venue catalog for the BookingStad demo tenant.
 *
 * Five listing types, one per sport, rather than a single "Sân thể thao" type
 * with a `sport` attribute: the useful filters differ per sport (a football
 * pitch is 5/7/11-a-side, a badminton court has a ceiling height) and merging
 * them would show every filter on every sport.
 *
 * Every court is a plain standalone hourly listing — no groups, no packages, no
 * stock — so this generator is far simpler than the studio one and deliberately
 * reuses its `upsertListing` / `ensureWeeklyRules` helpers rather than copying
 * them.
 */

const FOOTBALL_SIZES = ['Sân 5 người', 'Sân 7 người', 'Sân 11 người'];
const FOOTBALL_SURFACES = ['Cỏ nhân tạo', 'Cỏ tự nhiên'];
const BASKETBALL_FLOORS = ['Sàn gỗ', 'Sàn nhựa PU', 'Bê tông phủ sơn'];
const TENNIS_SURFACES = ['Sân cứng (hard court)', 'Đất nện', 'Cỏ nhân tạo'];
const BADMINTON_FLOORS = ['Thảm cao su', 'Sàn PU', 'Sàn gỗ'];
const PICKLEBALL_SURFACES = ['Sân cứng', 'Thảm acrylic'];

/** Peak-hour pricing is applied separately; this is the off-peak base rate. */
const hourly = (basePrice: number): Prisma.InputJsonValue =>
  modeConfigSchema.parse({
    hourly: {
      basePrice: String(basePrice),
      packages: [],
      minDuration: 1,
      maxDuration: 4,
      granularity: 30,
      leadTimeMin: 0,
    },
  });

const boolAttr = (key: string, label: string, icon: string) => ({
  key,
  label,
  type: 'boolean',
  filterable: true,
  icon,
});

const searchConfig = (attributeFacets: Prisma.InputJsonValue[]): Prisma.InputJsonValue => ({
  ...listingTypeSearchConfigSchema.parse({
    schedule: 'hourly',
    showGuests: false,
    systemFacets: ['price', 'location', 'amenities'],
    attributeFacets,
  }),
});

export const SPORT_CATALOG: CatalogDefinition[] = [
  {
    name: 'Sân bóng đá',
    slug: 'san-bong-da',
    icon: 'Goal',
    structure: 'standalone',
    allowedModes: ['hourly'],
    defaultModes: ['hourly'],
    unitLabel: 'giờ',
    partner: 'service',
    bufferBefore: 15,
    bufferAfter: 15,
    depositPercent: 30,
    attributeSchema: [
      {
        key: 'pitchSize',
        label: 'Loại sân',
        type: 'select',
        required: true,
        filterable: true,
        options: FOOTBALL_SIZES,
        icon: 'Users',
      },
      {
        key: 'surface',
        label: 'Mặt sân',
        type: 'select',
        required: true,
        filterable: true,
        options: FOOTBALL_SURFACES,
        icon: 'Sprout',
      },
      boolAttr('roofed', 'Có mái che', 'Umbrella'),
      boolAttr('nightLights', 'Đèn chiếu sáng ban đêm', 'Lightbulb'),
      boolAttr('changingRoom', 'Phòng thay đồ', 'DoorOpen'),
      { key: 'facilities', label: 'Tiện ích khác', type: 'list', icon: 'ListChecks' },
    ],
    searchConfig: searchConfig([
      { key: 'pitchSize', control: 'checkbox' },
      { key: 'surface', control: 'checkbox' },
      { key: 'roofed', control: 'checkbox' },
      { key: 'nightLights', control: 'checkbox' },
    ]),
    title: (index, location) => `Sân bóng đá ${location.shortName} ${index + 1}`,
    description: (index, location) =>
      `Sân bóng ${cycle(FOOTBALL_SIZES, index).toLowerCase()} mặt ${cycle(
        FOOTBALL_SURFACES,
        index,
      ).toLowerCase()} tại ${location.shortName}. Có phòng thay đồ, chỗ đậu xe và nước uống.`,
    attributes: (index) => ({
      pitchSize: cycle(FOOTBALL_SIZES, index),
      surface: cycle(FOOTBALL_SURFACES, index),
      roofed: index % 3 === 0,
      nightLights: true,
      changingRoom: index % 2 === 0,
      facilities: ['Chỗ đậu xe', 'Nước uống', 'Cho thuê áo bib'],
    }),
    modeConfig: (index) => hourly(250_000 + (index % 4) * 50_000),
  },
  {
    name: 'Sân bóng rổ',
    slug: 'san-bong-ro',
    icon: 'Dribbble',
    structure: 'standalone',
    allowedModes: ['hourly'],
    defaultModes: ['hourly'],
    unitLabel: 'giờ',
    partner: 'service',
    bufferBefore: 15,
    bufferAfter: 15,
    depositPercent: 30,
    attributeSchema: [
      {
        key: 'floor',
        label: 'Mặt sàn',
        type: 'select',
        required: true,
        filterable: true,
        options: BASKETBALL_FLOORS,
        icon: 'Grid3x3',
      },
      boolAttr('indoor', 'Trong nhà', 'Building2'),
      boolAttr('nightLights', 'Đèn chiếu sáng ban đêm', 'Lightbulb'),
      { key: 'hoopCount', label: 'Số rổ', type: 'number', filterable: true, icon: 'Target' },
      { key: 'facilities', label: 'Tiện ích khác', type: 'list', icon: 'ListChecks' },
    ],
    searchConfig: searchConfig([
      { key: 'floor', control: 'checkbox' },
      { key: 'indoor', control: 'checkbox' },
      { key: 'nightLights', control: 'checkbox' },
    ]),
    title: (index, location) => `Sân bóng rổ ${location.shortName} ${index + 1}`,
    description: (index, location) =>
      `Sân bóng rổ ${cycle(BASKETBALL_FLOORS, index).toLowerCase()} tại ${
        location.shortName
      }. Vạch kẻ tiêu chuẩn, rổ chỉnh được độ cao.`,
    attributes: (index) => ({
      floor: cycle(BASKETBALL_FLOORS, index),
      indoor: index % 2 === 0,
      nightLights: true,
      hoopCount: 2,
      facilities: ['Chỗ đậu xe', 'Ghế ngồi cổ động viên'],
    }),
    modeConfig: (index) => hourly(200_000 + (index % 3) * 50_000),
  },
  {
    name: 'Sân tennis',
    slug: 'san-tennis',
    icon: 'Circle',
    structure: 'standalone',
    allowedModes: ['hourly'],
    defaultModes: ['hourly'],
    unitLabel: 'giờ',
    partner: 'service',
    bufferBefore: 15,
    bufferAfter: 15,
    depositPercent: 30,
    attributeSchema: [
      {
        key: 'surface',
        label: 'Mặt sân',
        type: 'select',
        required: true,
        filterable: true,
        options: TENNIS_SURFACES,
        icon: 'Sprout',
      },
      boolAttr('indoor', 'Trong nhà', 'Building2'),
      boolAttr('nightLights', 'Đèn chiếu sáng ban đêm', 'Lightbulb'),
      boolAttr('racketRental', 'Cho thuê vợt', 'Handshake'),
      { key: 'facilities', label: 'Tiện ích khác', type: 'list', icon: 'ListChecks' },
    ],
    searchConfig: searchConfig([
      { key: 'surface', control: 'checkbox' },
      { key: 'indoor', control: 'checkbox' },
      { key: 'nightLights', control: 'checkbox' },
    ]),
    title: (index, location) => `Sân tennis ${location.shortName} ${index + 1}`,
    description: (index, location) =>
      `Sân tennis mặt ${cycle(TENNIS_SURFACES, index).toLowerCase()} tại ${
        location.shortName
      }. Lưới và vạch kẻ đạt chuẩn thi đấu.`,
    attributes: (index) => ({
      surface: cycle(TENNIS_SURFACES, index),
      indoor: index % 3 === 0,
      nightLights: true,
      racketRental: index % 2 === 0,
      facilities: ['Chỗ đậu xe', 'Ghế nghỉ', 'Cho thuê bóng'],
    }),
    modeConfig: (index) => hourly(180_000 + (index % 4) * 40_000),
  },
  {
    name: 'Sân cầu lông',
    slug: 'san-cau-long',
    icon: 'Feather',
    structure: 'standalone',
    allowedModes: ['hourly'],
    defaultModes: ['hourly'],
    unitLabel: 'giờ',
    partner: 'service',
    bufferBefore: 15,
    bufferAfter: 15,
    depositPercent: 30,
    attributeSchema: [
      {
        key: 'floor',
        label: 'Mặt sàn',
        type: 'select',
        required: true,
        filterable: true,
        options: BADMINTON_FLOORS,
        icon: 'Grid3x3',
      },
      {
        key: 'ceilingHeight',
        label: 'Chiều cao trần (m)',
        type: 'number',
        required: true,
        filterable: true,
        icon: 'MoveVertical',
      },
      boolAttr('airConditioned', 'Có điều hoà', 'Wind'),
      boolAttr('racketRental', 'Cho thuê vợt', 'Handshake'),
      { key: 'facilities', label: 'Tiện ích khác', type: 'list', icon: 'ListChecks' },
    ],
    searchConfig: searchConfig([
      { key: 'floor', control: 'checkbox' },
      { key: 'ceilingHeight', control: 'range' },
      { key: 'airConditioned', control: 'checkbox' },
    ]),
    title: (index, location) => `Sân cầu lông ${location.shortName} ${index + 1}`,
    description: (index, location) =>
      `Sân cầu lông ${cycle(BADMINTON_FLOORS, index).toLowerCase()} tại ${
        location.shortName
      }. Trần cao, ánh sáng chống chói, không gian kín gió.`,
    attributes: (index) => ({
      floor: cycle(BADMINTON_FLOORS, index),
      ceilingHeight: 8 + (index % 4),
      airConditioned: index % 3 === 0,
      racketRental: true,
      facilities: ['Chỗ đậu xe', 'Cho thuê cầu', 'Nước uống'],
    }),
    modeConfig: (index) => hourly(90_000 + (index % 4) * 20_000),
  },
  {
    name: 'Sân pickleball',
    slug: 'san-pickleball',
    icon: 'Zap',
    structure: 'standalone',
    allowedModes: ['hourly'],
    defaultModes: ['hourly'],
    unitLabel: 'giờ',
    partner: 'service',
    bufferBefore: 15,
    bufferAfter: 15,
    depositPercent: 30,
    attributeSchema: [
      {
        key: 'surface',
        label: 'Mặt sân',
        type: 'select',
        required: true,
        filterable: true,
        options: PICKLEBALL_SURFACES,
        icon: 'Sprout',
      },
      boolAttr('indoor', 'Trong nhà', 'Building2'),
      boolAttr('nightLights', 'Đèn chiếu sáng ban đêm', 'Lightbulb'),
      boolAttr('paddleRental', 'Cho thuê vợt', 'Handshake'),
      { key: 'facilities', label: 'Tiện ích khác', type: 'list', icon: 'ListChecks' },
    ],
    searchConfig: searchConfig([
      { key: 'surface', control: 'checkbox' },
      { key: 'indoor', control: 'checkbox' },
      { key: 'paddleRental', control: 'checkbox' },
    ]),
    title: (index, location) => `Sân pickleball ${location.shortName} ${index + 1}`,
    description: (index, location) =>
      `Sân pickleball mặt ${cycle(PICKLEBALL_SURFACES, index).toLowerCase()} tại ${
        location.shortName
      }. Có cho thuê vợt và bóng, phù hợp cả người mới chơi.`,
    attributes: (index) => ({
      surface: cycle(PICKLEBALL_SURFACES, index),
      indoor: index % 2 === 1,
      nightLights: true,
      paddleRental: true,
      facilities: ['Chỗ đậu xe', 'Cho thuê bóng', 'Huấn luyện viên theo giờ'],
    }),
    modeConfig: (index) => hourly(120_000 + (index % 3) * 30_000),
  },
];

/** Courts per sport. 8 × 5 sports = 40 listings, enough to page and filter. */
const COURTS_PER_SPORT = 8;

/**
 * The five court types + their categories — the tenant's CATALOG CONFIGURATION.
 *
 * Split from the court generator below because production seeds the config
 * (a partner cannot list a pitch without a "Sân bóng đá" type) but never the
 * demo courts.
 */
export async function seedSportCatalogTypes(
  prisma: PrismaClient,
  tenantId: string,
): Promise<CatalogTypes> {
  const listingTypes: CatalogTypes['listingTypes'] = new Map();
  const categories: CatalogTypes['categories'] = new Map();
  for (const [sortIndex, definition] of SPORT_CATALOG.entries()) {
    listingTypes.set(
      definition.slug,
      await upsertListingType(prisma, tenantId, definition, sortIndex + 1),
    );
    categories.set(
      definition.slug,
      await upsertCategory(prisma, tenantId, definition.name, definition.slug),
    );
  }
  return { listingTypes, categories };
}

/** The 40 demo courts. Dev/staging only. */
export async function seedSportCatalog(input: {
  prisma: PrismaClient;
  tenantId: string;
  partnerId: string;
  cancellationPolicyId: string;
  types: CatalogTypes;
}): Promise<{ primaryCourtId: string; primaryCourtResourceId: string }> {
  const { prisma, tenantId, partnerId, cancellationPolicyId } = input;
  let primary: { id: string; resourceId: string } | null = null;

  for (const definition of SPORT_CATALOG) {
    const listingType = input.types.listingTypes.get(definition.slug)!;
    const category = input.types.categories.get(definition.slug)!;

    for (let index = 0; index < COURTS_PER_SPORT; index += 1) {
      const location: LocationFixture = cycle(LOCATIONS, index);
      const listing = await upsertListing(prisma, {
        tenantId,
        partnerId,
        listingTypeId: listingType.id,
        groupId: null,
        categoryId: category.id,
        cancellationPolicyId,
        title: definition.title(index, location),
        slug: `seed-${definition.slug}-${String(index + 1).padStart(2, '0')}`,
        description: definition.description(index, location),
        photos: photosFor(definition.slug, index + 1),
        bookingModes: definition.defaultModes,
        attributes: definition.attributes(index),
        modeConfig: definition.modeConfig(index),
        bufferBefore: definition.bufferBefore,
        bufferAfter: definition.bufferAfter,
        depositPercent: definition.depositPercent,
        location,
      });
      await ensureWeeklyRules(prisma, tenantId, listing.id);
      primary ??= { id: listing.id, resourceId: listing.resourceId };
    }
  }

  if (!primary) throw new Error('Sport catalog seeded no listings');
  return { primaryCourtId: primary.id, primaryCourtResourceId: primary.resourceId };
}
