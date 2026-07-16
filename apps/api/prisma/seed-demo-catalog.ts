import type { Prisma, PrismaClient } from '@prisma/client';

type BookingMode = 'hourly' | 'daily' | 'inventory' | 'appointment';

type LocationFixture = {
  key: string;
  shortName: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  address: string;
};

type CatalogDefinition = {
  name: string;
  slug: string;
  icon: string;
  structure: 'standalone' | 'flexible';
  itemLabel?: string;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  unitLabel: string;
  requiresIdentityVerification?: boolean;
  attributeSchema: Prisma.InputJsonValue;
  partner: 'service' | 'inventory';
  title: (index: number, location: LocationFixture) => string;
  description: (index: number, location: LocationFixture) => string;
  attributes: (index: number) => Prisma.InputJsonValue;
  modeConfig: (index: number) => Prisma.InputJsonValue;
  stockQuantity?: (index: number) => number;
  capacity?: (index: number) => number;
  bufferBefore: number;
  bufferAfter: number;
  depositPercent: number;
};

const LOCATIONS: LocationFixture[] = [
  {
    key: 'ho-chi-minh',
    shortName: 'Hồ Chí Minh',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26740',
    wardName: 'Phường Sài Gòn',
    address: '12 Nguyễn Huệ',
  },
  {
    key: 'da-nang',
    shortName: 'Đà Nẵng',
    provinceCode: '48',
    provinceName: 'Thành phố Đà Nẵng',
    wardCode: '20263',
    wardName: 'Phường Sơn Trà',
    address: '86 Hoàng Sa',
  },
  {
    key: 'ha-noi',
    shortName: 'Hà Nội',
    provinceCode: '01',
    provinceName: 'Thành phố Hà Nội',
    wardCode: '00004',
    wardName: 'Phường Ba Đình',
    address: '35 Phan Đình Phùng',
  },
  {
    key: 'sapa',
    shortName: 'Sapa',
    provinceCode: '10',
    provinceName: 'Tỉnh Lào Cai',
    wardCode: '03106',
    wardName: 'Phường Sa Pa',
    address: '18 Fansipan',
  },
  {
    key: 'da-lat',
    shortName: 'Đà Lạt',
    provinceCode: '68',
    provinceName: 'Tỉnh Lâm Đồng',
    wardCode: '24787',
    wardName: 'Phường Xuân Hương - Đà Lạt',
    address: '22 Trần Phú',
  },
];

const STYLES = ['Hàn Quốc', 'Vintage', 'Tối giản', 'Editorial', 'Tropical'];
const PHOTO_STYLES = ['Chân dung', 'Cưới', 'Gia đình', 'Thời trang', 'Sản phẩm'];
const MAKEUP_STYLES = ['Cô dâu', 'Sự kiện', 'Editorial', 'Tự nhiên', 'Đi tiệc'];
const EQUIPMENT_BRANDS = ['Sony', 'Canon', 'Nikon', 'Fujifilm', 'Aputure'];
const COSTUME_STYLES = ['Áo dài', 'Dạ hội', 'Cổ trang', 'Công sở', 'Streetwear'];
const MODEL_LEVELS = ['Mới', 'Bán chuyên', 'Chuyên nghiệp'];

const CATALOG: CatalogDefinition[] = [
  {
    name: 'Studio',
    slug: 'studio',
    icon: 'Camera',
    structure: 'flexible',
    itemLabel: 'phòng',
    allowedModes: ['hourly', 'daily'],
    defaultModes: ['hourly', 'daily'],
    unitLabel: 'giờ / ngày',
    partner: 'service',
    bufferBefore: 30,
    bufferAfter: 30,
    depositPercent: 50,
    attributeSchema: [
      { key: 'area', label: 'Diện tích (m²)', type: 'number', required: true, filterable: true },
      {
        key: 'style',
        label: 'Phong cách',
        type: 'select',
        required: true,
        filterable: true,
        options: STYLES,
      },
      { key: 'naturalLight', label: 'Ánh sáng tự nhiên', type: 'boolean', filterable: true },
      { key: 'ceilingHeight', label: 'Chiều cao trần (m)', type: 'number', filterable: true },
    ],
    title: (index, location) =>
      index === 0
        ? 'Studio A — Hàn Quốc'
        : `Studio ${cycle(STYLES, index)} ${location.shortName} ${String(index + 1).padStart(2, '0')}`,
    description: (index, location) =>
      `Studio ${cycle(STYLES, index).toLowerCase()} đầy đủ ánh sáng, phông nền, khu thay đồ, máy lạnh và hỗ trợ set-up tại ${location.shortName}. Phù hợp chụp ảnh, quay video, livestream và sản xuất nội dung theo giờ hoặc trọn ngày.`,
    attributes: (index) => ({
      area: 35 + (index % 6) * 10,
      style: cycle(STYLES, index),
      naturalLight: index % 2 === 0,
      ceilingHeight: 3 + (index % 4) * 0.5,
    }),
    modeConfig: (index) => ({
      hourly: {
        basePrice: String(280_000 + index * 20_000),
        blocks: [
          { hours: 2, price: String(520_000 + index * 35_000) },
          { hours: 4, price: String(960_000 + index * 60_000) },
        ],
        minDuration: 1,
        maxDuration: 10,
        granularity: 60,
        leadTimeMin: 120,
      },
      daily: {
        basePricePerNight: String(1_900_000 + index * 90_000),
        blocks: [{ days: 3, price: String(5_400_000 + index * 240_000) }],
        minNights: 1,
        maxNights: 14,
        checkinTime: '08:00',
        checkoutTime: '20:00',
        leadTimeMin: 240,
      },
    }),
    capacity: (index) => 8 + (index % 5) * 2,
  },
  {
    name: 'Nhiếp ảnh',
    slug: 'photography',
    icon: 'Aperture',
    structure: 'standalone',
    itemLabel: 'gói',
    allowedModes: ['hourly'],
    defaultModes: ['hourly'],
    unitLabel: 'gói',
    partner: 'service',
    bufferBefore: 30,
    bufferAfter: 60,
    depositPercent: 50,
    attributeSchema: [
      {
        key: 'photographyStyle',
        label: 'Thể loại chụp',
        type: 'select',
        required: true,
        filterable: true,
        options: PHOTO_STYLES,
      },
      { key: 'editedPhotos', label: 'Số ảnh chỉnh sửa', type: 'number', required: true },
      { key: 'rawFiles', label: 'Bàn giao file gốc', type: 'boolean', filterable: true },
    ],
    title: (index, location) =>
      `Gói chụp ${cycle(PHOTO_STYLES, index)} ${location.shortName} ${String(index + 1).padStart(2, '0')}`,
    description: (index, location) =>
      `Gói chụp ${cycle(PHOTO_STYLES, index).toLowerCase()} tại ${location.shortName}, gồm tư vấn concept, nhiếp ảnh gia, hỗ trợ tạo dáng, hậu kỳ màu và bàn giao album online chất lượng cao.`,
    attributes: (index) => ({
      photographyStyle: cycle(PHOTO_STYLES, index),
      editedPhotos: 20 + (index % 5) * 10,
      rawFiles: index % 2 === 0,
    }),
    modeConfig: (index) => ({
      hourly: {
        basePrice: String(650_000 + index * 35_000),
        blocks: [
          { hours: 2, price: String(1_200_000 + index * 60_000) },
          { hours: 4, price: String(2_200_000 + index * 100_000) },
        ],
        minDuration: 1,
        maxDuration: 8,
        granularity: 60,
        leadTimeMin: 240,
      },
    }),
    capacity: () => 6,
  },
  {
    name: 'Makeup',
    slug: 'makeup',
    icon: 'Sparkles',
    structure: 'standalone',
    itemLabel: 'gói',
    allowedModes: ['hourly'],
    defaultModes: ['hourly'],
    unitLabel: 'gói',
    partner: 'service',
    bufferBefore: 30,
    bufferAfter: 30,
    depositPercent: 50,
    requiresIdentityVerification: true,
    attributeSchema: [
      {
        key: 'makeupStyle',
        label: 'Phong cách makeup',
        type: 'select',
        required: true,
        filterable: true,
        options: MAKEUP_STYLES,
      },
      { key: 'hairStyling', label: 'Kèm làm tóc', type: 'boolean', filterable: true },
      { key: 'touchUpHours', label: 'Số giờ dặm lại', type: 'number' },
    ],
    title: (index, location) =>
      `Gói makeup ${cycle(MAKEUP_STYLES, index)} ${location.shortName} ${String(index + 1).padStart(2, '0')}`,
    description: (index, location) =>
      `Dịch vụ makeup ${cycle(MAKEUP_STYLES, index).toLowerCase()} tại ${location.shortName}, bao gồm tư vấn phong cách, chuẩn bị da, makeup, làm tóc và bộ dụng cụ vệ sinh riêng cho từng khách.`,
    attributes: (index) => ({
      makeupStyle: cycle(MAKEUP_STYLES, index),
      hairStyling: true,
      touchUpHours: index % 4,
    }),
    modeConfig: (index) => ({
      hourly: {
        basePrice: String(450_000 + index * 30_000),
        blocks: [
          { hours: 2, price: String(820_000 + index * 50_000) },
          { hours: 4, price: String(1_500_000 + index * 90_000) },
        ],
        minDuration: 1,
        maxDuration: 6,
        granularity: 60,
        leadTimeMin: 180,
      },
    }),
    capacity: () => 2,
  },
  {
    name: 'Thiết bị',
    slug: 'equipment',
    icon: 'Package',
    structure: 'standalone',
    itemLabel: 'thiết bị',
    allowedModes: ['inventory'],
    defaultModes: ['inventory'],
    unitLabel: 'ngày',
    partner: 'inventory',
    bufferBefore: 120,
    bufferAfter: 180,
    depositPercent: 100,
    attributeSchema: [
      { key: 'brand', label: 'Hãng', type: 'text', required: true, filterable: true },
      { key: 'model', label: 'Model', type: 'text', required: true },
      {
        key: 'condition',
        label: 'Tình trạng',
        type: 'select',
        required: true,
        filterable: true,
        options: ['Mới', 'Rất tốt', 'Tốt'],
      },
      { key: 'insuranceIncluded', label: 'Kèm bảo hiểm', type: 'boolean', filterable: true },
    ],
    title: (index, location) =>
      `${cycle(EQUIPMENT_BRANDS, index)} Production Kit ${String(index + 1).padStart(2, '0')} — ${location.shortName}`,
    description: (index, location) =>
      `Bộ thiết bị ${cycle(EQUIPMENT_BRANDS, index)} đã kiểm tra kỹ thuật tại ${location.shortName}, kèm pin, sạc, thẻ nhớ, túi chống sốc, hướng dẫn bàn giao và hỗ trợ kỹ thuật trong thời gian thuê.`,
    attributes: (index) => ({
      brand: cycle(EQUIPMENT_BRANDS, index),
      model: `Production Kit ${100 + index}`,
      condition: index % 3 === 0 ? 'Mới' : index % 3 === 1 ? 'Rất tốt' : 'Tốt',
      insuranceIncluded: index % 2 === 0,
    }),
    modeConfig: (index) => ({
      inventory: {
        unit: 'day',
        basePrice: String(550_000 + index * 45_000),
        securityDeposit: String(3_000_000 + index * 250_000),
        minDuration: 1,
        maxDuration: 30,
        lateFeePerUnit: String(700_000 + index * 50_000),
      },
    }),
    stockQuantity: (index) => 2 + (index % 5),
  },
  {
    name: 'Trang phục',
    slug: 'costume',
    icon: 'Shirt',
    structure: 'standalone',
    itemLabel: 'trang phục',
    allowedModes: ['inventory'],
    defaultModes: ['inventory'],
    unitLabel: 'ngày',
    partner: 'inventory',
    bufferBefore: 60,
    bufferAfter: 240,
    depositPercent: 100,
    attributeSchema: [
      {
        key: 'costumeStyle',
        label: 'Phong cách',
        type: 'select',
        required: true,
        filterable: true,
        options: COSTUME_STYLES,
      },
      {
        key: 'size',
        label: 'Kích cỡ',
        type: 'multiselect',
        required: true,
        filterable: true,
        options: ['XS', 'S', 'M', 'L', 'XL'],
      },
      { key: 'accessoriesIncluded', label: 'Kèm phụ kiện', type: 'boolean', filterable: true },
    ],
    title: (index, location) =>
      `Bộ ${cycle(COSTUME_STYLES, index)} ${location.shortName} ${String(index + 1).padStart(2, '0')}`,
    description: (index, location) =>
      `Trang phục ${cycle(COSTUME_STYLES, index).toLowerCase()} được vệ sinh và ủi hấp sau mỗi lượt thuê tại ${location.shortName}, có nhiều size, phụ kiện đồng bộ, thử đồ và hỗ trợ chỉnh sửa cơ bản.`,
    attributes: (index) => ({
      costumeStyle: cycle(COSTUME_STYLES, index),
      size: index % 2 === 0 ? ['S', 'M', 'L'] : ['M', 'L', 'XL'],
      accessoriesIncluded: true,
    }),
    modeConfig: (index) => ({
      inventory: {
        unit: 'day',
        basePrice: String(280_000 + index * 20_000),
        securityDeposit: String(1_000_000 + index * 100_000),
        minDuration: 1,
        maxDuration: 14,
        lateFeePerUnit: String(350_000 + index * 25_000),
      },
    }),
    stockQuantity: (index) => 3 + (index % 6),
  },
  {
    name: 'Model',
    slug: 'model',
    icon: 'Users',
    structure: 'standalone',
    itemLabel: 'lịch hẹn',
    allowedModes: ['appointment'],
    defaultModes: ['appointment'],
    unitLabel: 'buổi',
    partner: 'service',
    bufferBefore: 30,
    bufferAfter: 60,
    depositPercent: 50,
    requiresIdentityVerification: true,
    attributeSchema: [
      { key: 'height', label: 'Chiều cao (cm)', type: 'number', required: true, filterable: true },
      {
        key: 'experienceLevel',
        label: 'Kinh nghiệm',
        type: 'select',
        required: true,
        filterable: true,
        options: MODEL_LEVELS,
      },
      { key: 'languages', label: 'Ngôn ngữ', type: 'text', filterable: true },
      { key: 'travelReady', label: 'Có thể đi tỉnh', type: 'boolean', filterable: true },
    ],
    title: (index, location) =>
      `Model ${cycle(MODEL_LEVELS, index)} ${location.shortName} ${String(index + 1).padStart(2, '0')}`,
    description: (index, location) =>
      `Model ${cycle(MODEL_LEVELS, index).toLowerCase()} nhận lịch hẹn chụp lookbook, quảng cáo, lifestyle và sự kiện tại ${location.shortName}; hồ sơ đã có portfolio, số đo, kinh nghiệm và phạm vi di chuyển rõ ràng.`,
    attributes: (index) => ({
      height: 165 + (index % 12),
      experienceLevel: cycle(MODEL_LEVELS, index),
      languages: index % 2 === 0 ? 'Tiếng Việt, Tiếng Anh' : 'Tiếng Việt',
      travelReady: index % 3 !== 0,
    }),
    modeConfig: (index) => ({
      appointment: {
        basePrice: String(900_000 + index * 50_000),
        durationMinutes: index % 2 === 0 ? 120 : 180,
        leadTimeMin: 360,
      },
    }),
    capacity: () => 1,
  },
];

export async function seedDemoCatalog(input: {
  prisma: PrismaClient;
  tenantId: string;
  servicePartnerId: string;
  inventoryPartnerId: string;
  cancellationPolicyId: string;
}) {
  const { prisma, tenantId } = input;
  const listingTypes = new Map<string, Awaited<ReturnType<typeof upsertListingType>>>();
  const categories = new Map<string, Awaited<ReturnType<typeof upsertCategory>>>();

  for (const [sortIndex, definition] of CATALOG.entries()) {
    listingTypes.set(
      definition.slug,
      await upsertListingType(prisma, tenantId, definition, sortIndex + 1),
    );
    categories.set(
      definition.slug,
      await upsertCategory(prisma, tenantId, definition.name, definition.slug),
    );
  }

  const desiredListingSlugs = new Set<string>();
  const desiredGroupSlugs = new Set<string>();
  let primaryStudio: Awaited<ReturnType<typeof upsertListing>> | null = null;

  for (const definition of CATALOG) {
    const listingType = listingTypes.get(definition.slug)!;
    const category = categories.get(definition.slug)!;

    for (let index = 0; index < 20; index += 1) {
      const groupNumber =
        definition.slug === 'studio' && index >= 10 ? Math.floor((index - 10) / 2) : null;
      const location =
        groupNumber === null ? cycle(LOCATIONS, index) : cycle(LOCATIONS, groupNumber);
      const slug =
        definition.slug === 'studio' && index === 0
          ? 'studio-a-han-quoc'
          : `seed-${definition.slug}-${String(index + 1).padStart(2, '0')}`;
      desiredListingSlugs.add(slug);

      let groupId: string | null = null;
      if (groupNumber !== null) {
        const groupSlug = `seed-studio-group-${String(groupNumber + 1).padStart(2, '0')}`;
        desiredGroupSlugs.add(groupSlug);
        groupId = (
          await upsertStudioGroup(
            prisma,
            tenantId,
            input.servicePartnerId,
            listingType.id,
            groupSlug,
            groupNumber,
            location,
          )
        ).id;
      }

      const partnerId =
        definition.partner === 'inventory' ? input.inventoryPartnerId : input.servicePartnerId;
      const listing = await upsertListing(prisma, {
        tenantId,
        partnerId,
        listingTypeId: listingType.id,
        groupId,
        categoryId: category.id,
        cancellationPolicyId: input.cancellationPolicyId,
        title: definition.title(index, location),
        slug,
        description: definition.description(index, location),
        photos: photosFor(definition.slug, index + 1),
        bookingModes: definition.allowedModes,
        attributes: definition.attributes(index),
        modeConfig: definition.modeConfig(index),
        stockQuantity: definition.stockQuantity?.(index),
        capacity: definition.capacity?.(index),
        bufferBefore: definition.bufferBefore,
        bufferAfter: definition.bufferAfter,
        depositPercent: definition.depositPercent,
        location,
      });

      if (definition.slug === 'studio' && index === 0) primaryStudio = listing;
      if (
        definition.allowedModes.includes('hourly') ||
        definition.allowedModes.includes('appointment')
      ) {
        await ensureWeeklyRules(prisma, tenantId, listing.id);
      }
    }
  }

  await cleanupLegacyStudioHubCatalog(
    prisma,
    tenantId,
    [...desiredListingSlugs],
    [...desiredGroupSlugs],
  );

  if (!primaryStudio) throw new Error('The primary Studio seed listing was not created');
  return {
    primaryStudio,
    studioType: listingTypes.get('studio')!,
    equipmentType: listingTypes.get('equipment')!,
  };
}

export async function removeLegacySeedListing(
  prisma: PrismaClient,
  tenantId: string,
  slug: string,
): Promise<void> {
  const listing = await prisma.listing.findUnique({
    where: { tenantId_slug: { tenantId, slug } },
    select: { id: true, resourceId: true },
  });
  if (!listing) return;
  if (await prisma.booking.findFirst({ where: { listingId: listing.id } })) return;
  await prisma.listing.delete({ where: { id: listing.id } });
  await prisma.resource.deleteMany({
    where: { id: listing.resourceId, listings: { none: {} }, bookings: { none: {} } },
  });
}

async function upsertListingType(
  prisma: PrismaClient,
  tenantId: string,
  definition: CatalogDefinition,
  sortOrder: number,
) {
  const data = {
    name: definition.name,
    icon: definition.icon,
    structure: definition.structure,
    itemLabel: definition.itemLabel ?? null,
    allowedModes: definition.allowedModes as never,
    defaultModes: definition.defaultModes as never,
    unitLabel: definition.unitLabel,
    sortOrder,
    isActive: true,
    attributeSchema: definition.attributeSchema,
    requiresIdentityVerification: definition.requiresIdentityVerification ?? false,
  };
  return prisma.listingType.upsert({
    where: { tenantId_slug: { tenantId, slug: definition.slug } },
    update: data,
    create: { tenantId, slug: definition.slug, ...data },
  });
}

async function upsertCategory(prisma: PrismaClient, tenantId: string, name: string, slug: string) {
  return prisma.category.upsert({
    where: { tenantId_slug: { tenantId, slug } },
    update: { name },
    create: { tenantId, name, slug },
  });
}

async function upsertStudioGroup(
  prisma: PrismaClient,
  tenantId: string,
  partnerId: string,
  listingTypeId: string,
  slug: string,
  index: number,
  location: LocationFixture,
) {
  const title = `Tổ hợp Studio ${location.shortName} ${String(index + 1).padStart(2, '0')}`;
  const data = {
    partnerId,
    listingTypeId,
    title,
    description: `Tổ hợp hai phòng studio độc lập tại ${location.shortName}, có lễ tân, khu trang điểm, phòng thay đồ, kho đạo cụ và đội ngũ hỗ trợ set-up tại chỗ.`,
    provinceCode: location.provinceCode,
    provinceName: location.provinceName,
    wardCode: location.wardCode,
    wardName: location.wardName,
    address: location.address,
    workingArea: `${location.shortName} và khu vực lân cận`,
    photos: photosFor('studio-group', index + 1),
    amenities: [
      'Lễ tân',
      'Chỗ đậu xe',
      'Máy lạnh',
      'Phòng thay đồ',
      'Khu makeup',
      'Wi-Fi tốc độ cao',
    ],
    status: 'published' as const,
    publishedBy: 'partner' as const,
    ratingAvg: 4.6 + (index % 4) * 0.1,
    bookingCount: 12 + index * 3,
  };
  return prisma.listingGroup.upsert({
    where: { tenantId_slug: { tenantId, slug } },
    update: data,
    create: { tenantId, slug, ...data },
  });
}

async function upsertListing(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    partnerId: string;
    listingTypeId: string;
    groupId: string | null;
    categoryId: string;
    cancellationPolicyId: string;
    title: string;
    slug: string;
    description: string;
    photos: string[];
    bookingModes: BookingMode[];
    attributes: Prisma.InputJsonValue;
    modeConfig: Prisma.InputJsonValue;
    stockQuantity?: number;
    capacity?: number;
    bufferBefore: number;
    bufferAfter: number;
    depositPercent: number;
    location: LocationFixture;
  },
) {
  const existing = await prisma.listing.findUnique({
    where: { tenantId_slug: { tenantId: input.tenantId, slug: input.slug } },
  });
  const commonData = {
    partnerId: input.partnerId,
    listingTypeId: input.listingTypeId,
    groupId: input.groupId,
    categoryId: input.categoryId,
    cancellationPolicyId: input.cancellationPolicyId,
    title: input.title,
    description: input.description,
    provinceCode: input.location.provinceCode,
    provinceName: input.location.provinceName,
    wardCode: input.location.wardCode,
    wardName: input.location.wardName,
    address: input.location.address,
    photos: input.photos,
    bookingModes: input.bookingModes as never,
    attributes: input.attributes,
    modeConfig: input.modeConfig,
    stockQuantity: input.stockQuantity ?? null,
    capacity: input.capacity ?? null,
    bufferBefore: input.bufferBefore,
    bufferAfter: input.bufferAfter,
    approvalRequired: false,
    depositPercent: input.depositPercent,
    balanceDue: 'online_before' as const,
    rescheduleAllowed: true,
    rescheduleDeadlineHours: 24,
    rescheduleFee: 100_000n,
    status: 'published' as const,
    publishedBy: 'partner' as const,
    publishedAt: new Date(),
  };

  if (existing) {
    await prisma.resource.update({
      where: { id: existing.resourceId },
      data: { partnerId: input.partnerId, name: input.title, timezone: 'Asia/Ho_Chi_Minh' },
    });
    return prisma.listing.update({ where: { id: existing.id }, data: commonData });
  }

  const resource = await prisma.resource.create({
    data: {
      tenantId: input.tenantId,
      partnerId: input.partnerId,
      name: input.title,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });
  return prisma.listing.create({
    data: {
      tenantId: input.tenantId,
      resourceId: resource.id,
      slug: input.slug,
      ...commonData,
    },
  });
}

async function ensureWeeklyRules(
  prisma: PrismaClient,
  tenantId: string,
  listingId: string,
): Promise<void> {
  await prisma.availabilityRule.deleteMany({ where: { listingId } });
  await prisma.availabilityRule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tenantId,
      listingId,
      dayOfWeek,
      openTime: dayOfWeek === 0 ? '09:00' : '08:00',
      closeTime: dayOfWeek === 0 ? '18:00' : '21:00',
    })),
  });
}

async function cleanupLegacyStudioHubCatalog(
  prisma: PrismaClient,
  tenantId: string,
  desiredListingSlugs: string[],
  desiredGroupSlugs: string[],
): Promise<void> {
  const obsoleteListings = await prisma.listing.findMany({
    where: {
      tenantId,
      NOT: { slug: { in: desiredListingSlugs } },
    },
    select: { id: true, resourceId: true },
  });
  if (obsoleteListings.length > 0) {
    const listingIds = obsoleteListings.map((item) => item.id);
    await prisma.bookingHold.deleteMany({ where: { listingId: { in: listingIds } } });
    // Demo checkout attempts, payments and status history cascade with their
    // booking. The three health fixtures belong to the retained primary Studio.
    await prisma.booking.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listing.deleteMany({
      where: { id: { in: listingIds } },
    });
    await prisma.resource.deleteMany({
      where: {
        id: { in: obsoleteListings.map((item) => item.resourceId) },
        listings: { none: {} },
        bookings: { none: {} },
      },
    });
  }

  await prisma.listingGroup.deleteMany({
    where: {
      tenantId,
      NOT: { slug: { in: desiredGroupSlugs } },
      listings: { none: {} },
    },
  });
  await prisma.category.deleteMany({
    where: {
      tenantId,
      NOT: { slug: { in: CATALOG.map((definition) => definition.slug) } },
      listings: { none: {} },
      commissionRules: { none: {} },
    },
  });
  await prisma.listingType.deleteMany({
    where: {
      tenantId,
      NOT: { slug: { in: CATALOG.map((definition) => definition.slug) } },
      listings: { none: {} },
      listingGroups: { none: {} },
      commissionRules: { none: {} },
    },
  });
}

function photosFor(kind: string, index: number): string[] {
  return Array.from(
    { length: 10 },
    (_, photoIndex) =>
      `https://picsum.photos/seed/bookify-${kind}-${String(index).padStart(2, '0')}-${String(photoIndex + 1).padStart(2, '0')}/1600/1200`,
  );
}

function cycle<T>(items: readonly T[], index: number): T {
  const value = items[index % items.length];
  if (value === undefined) throw new Error('Seed fixture collection must not be empty');
  return value;
}
