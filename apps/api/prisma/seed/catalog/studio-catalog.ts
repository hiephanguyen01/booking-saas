import type { Prisma, PrismaClient } from '@prisma/client';

export type BookingMode = 'hourly' | 'daily' | 'inventory';

export type LocationFixture = {
  key: string;
  shortName: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  address: string;
};

export type CatalogDefinition = {
  name: string;
  slug: string;
  icon: string;
  structure: 'standalone' | 'flexible';
  itemLabel?: string;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  unitLabel: string;
  bookingSelection?: 'flexible_duration' | 'fixed_packages';
  requiresIdentityVerification?: boolean;
  attributeSchema: Prisma.InputJsonValue;
  /**
   * Storefront search facets. The studio catalog's configs are keyed by slug in
   * `searchConfigFor`; catalogs defined elsewhere (e.g. the sport courts) pass
   * theirs here instead of extending that map.
   */
  searchConfig?: Prisma.InputJsonValue;
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

export const LOCATIONS: LocationFixture[] = [
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
      {
        key: 'area',
        label: 'Diện tích (m²)',
        type: 'number',
        required: true,
        filterable: true,
        icon: 'Building2',
      },
      {
        key: 'style',
        label: 'Phong cách',
        type: 'select',
        required: true,
        filterable: true,
        options: STYLES,
        icon: 'Palette',
      },
      {
        key: 'naturalLight',
        label: 'Ánh sáng tự nhiên',
        type: 'boolean',
        filterable: true,
        icon: 'Lightbulb',
      },
      {
        key: 'ceilingHeight',
        label: 'Chiều cao trần (m)',
        type: 'number',
        filterable: true,
        icon: 'Boxes',
      },
      { key: 'studioEquipment', label: 'Thiết bị sẵn có', type: 'list', icon: 'Lightbulb' },
      { key: 'includedServices', label: 'Dịch vụ kèm theo', type: 'list', icon: 'Check' },
      { key: 'houseRules', label: 'Nội quy', type: 'list', icon: 'Info' },
      { key: 'notIncluded', label: 'Không bao gồm', type: 'list', icon: 'CircleSlash' },
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
      studioEquipment: [
        'Phông nền 5 màu (trắng, đen, xám, pastel, xanh)',
        'Bộ đèn Godox 600W kèm softbox và beauty dish',
        'Gương toàn thân và bàn trang điểm có đèn',
        'Đạo cụ chụp cơ bản (ghế, bàn, khung tranh)',
      ],
      includedServices: [
        'Hỗ trợ set-up ánh sáng theo concept',
        'Wi-Fi tốc độ cao',
        'Nước uống miễn phí',
        'Chỗ để xe máy và ô tô',
      ],
      houseRules: [
        'Giữ vệ sinh chung, trả phòng đúng giờ',
        'Không hút thuốc trong phòng',
        'Đền bù theo giá trị nếu hư hỏng thiết bị',
      ],
      notIncluded: ['Nhiếp ảnh gia', 'Trang điểm - làm tóc', 'Chi phí in ấn ảnh'],
    }),
    modeConfig: (index) => ({
      hourly: {
        basePrice: String(280_000 + index * 20_000),
        packages: [],
        minDuration: 1,
        maxDuration: 10,
        granularity: 60,
        leadTimeMin: 120,
      },
      daily: {
        basePricePerNight: String(1_900_000 + index * 90_000),
        packages: [],
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
    bookingSelection: 'fixed_packages',
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
        icon: 'Camera',
      },
      {
        key: 'editedPhotos',
        label: 'Số ảnh chỉnh sửa',
        type: 'number',
        required: true,
        icon: 'Images',
      },
      {
        key: 'rawFiles',
        label: 'Bàn giao file gốc',
        type: 'boolean',
        filterable: true,
        icon: 'Package',
      },
      { key: 'crew', label: 'Ê-kíp', type: 'list', icon: 'Users' },
      { key: 'gear', label: 'Thiết bị sử dụng', type: 'text', icon: 'Camera' },
      { key: 'deliverables', label: 'Sản phẩm bàn giao', type: 'list', icon: 'Images' },
      { key: 'offers', label: 'Ưu đãi khác', type: 'list', icon: 'Gift' },
      { key: 'notIncluded', label: 'Không bao gồm', type: 'list', icon: 'CircleSlash' },
    ],
    title: (index, location) =>
      `Dịch vụ chụp ${cycle(PHOTO_STYLES, index)} ${location.shortName} ${String(index + 1).padStart(2, '0')}`,
    description: (index, location) =>
      `Gói chụp ${cycle(PHOTO_STYLES, index).toLowerCase()} tại ${location.shortName}, gồm tư vấn concept, nhiếp ảnh gia, hỗ trợ tạo dáng, hậu kỳ màu và bàn giao album online chất lượng cao.`,
    attributes: (index) => ({
      photographyStyle: cycle(PHOTO_STYLES, index),
      editedPhotos: 20 + (index % 5) * 10,
      rawFiles: index % 2 === 0,
      crew: [
        '01 nhiếp ảnh gia chính + 01 trợ lý',
        'Hỗ trợ tư vấn concept và tạo dáng',
        'Makeup artist đi kèm (gói nâng cao)',
      ],
      gear: 'Sony A7 IV, ống kính 35mm & 85mm, đèn Godox',
      deliverables: [
        'Album online chất lượng cao',
        `${20 + (index % 5) * 10} ảnh chỉnh sửa kỹ`,
        'Toàn bộ file gốc chưa chỉnh',
        '01 video hậu trường 30 giây',
      ],
      offers: [
        'Giảm 10% cho lần đặt thứ hai',
        'Tặng 05 ảnh in 10x15',
        'Miễn phí di chuyển nội thành',
      ],
      notIncluded: ['Chi phí thuê trang phục', 'Vé vào cửa địa điểm chụp', 'In album vật lý'],
    }),
    modeConfig: (index) => ({
      hourly: {
        packages: [
          {
            id: packageUuid('photography', index, 1),
            name: 'Gói 2 giờ',
            description: 'Buổi chụp tiêu chuẩn trong 120 phút',
            photos: photosFor('photography-package-2h', index + 1).slice(0, 5),
            durationMinutes: 120,
            price: String(1_200_000 + index * 60_000),
            isActive: true,
            sortOrder: 0,
          },
          {
            id: packageUuid('photography', index, 2),
            name: 'Gói 4 giờ',
            description: 'Buổi chụp mở rộng trong 240 phút',
            photos: photosFor('photography-package-4h', index + 1).slice(0, 5),
            durationMinutes: 240,
            price: String(2_200_000 + index * 100_000),
            isActive: true,
            sortOrder: 1,
          },
        ],
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
    bookingSelection: 'fixed_packages',
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
        icon: 'Sparkles',
      },
      {
        key: 'hairStyling',
        label: 'Kèm làm tóc',
        type: 'boolean',
        filterable: true,
        icon: 'Scissors',
      },
      { key: 'touchUpHours', label: 'Số giờ dặm lại', type: 'number', icon: 'Clock' },
      { key: 'products', label: 'Mỹ phẩm sử dụng', type: 'list', icon: 'Sparkles' },
      { key: 'includes', label: 'Quy trình', type: 'list', icon: 'Check' },
      { key: 'notIncluded', label: 'Không bao gồm', type: 'list', icon: 'CircleSlash' },
    ],
    title: (index, location) =>
      `Dịch vụ makeup ${cycle(MAKEUP_STYLES, index)} ${location.shortName} ${String(index + 1).padStart(2, '0')}`,
    description: (index, location) =>
      `Dịch vụ makeup ${cycle(MAKEUP_STYLES, index).toLowerCase()} tại ${location.shortName}, bao gồm tư vấn phong cách, chuẩn bị da, makeup, làm tóc và bộ dụng cụ vệ sinh riêng cho từng khách.`,
    attributes: (index) => ({
      makeupStyle: cycle(MAKEUP_STYLES, index),
      hairStyling: true,
      touchUpHours: index % 4,
      products: [
        'Mỹ phẩm cao cấp (MAC, Nars, Charlotte Tilbury)',
        'Lông mi giả và phụ kiện đi kèm',
        'Bộ cọ tiệt trùng riêng cho từng khách',
      ],
      includes: [
        'Tư vấn phong cách theo trang phục',
        'Chăm sóc và chuẩn bị nền da',
        'Trang điểm hoàn thiện + làm tóc',
        'Dặm lại tại chỗ trong buổi chụp',
      ],
      notIncluded: ['Chi phí di chuyển ngoài nội thành', 'Nối mi/uốn mi chuyên sâu'],
    }),
    modeConfig: (index) => ({
      hourly: {
        packages: [
          {
            id: packageUuid('makeup', index, 1),
            name: 'Gói 2 giờ',
            description: 'Makeup và hoàn thiện trong 120 phút',
            photos: photosFor('makeup-package-2h', index + 1).slice(0, 5),
            durationMinutes: 120,
            price: String(820_000 + index * 50_000),
            isActive: true,
            sortOrder: 0,
          },
          {
            id: packageUuid('makeup', index, 2),
            name: 'Gói 4 giờ',
            description: 'Makeup, làm tóc và hỗ trợ mở rộng trong 240 phút',
            photos: photosFor('makeup-package-4h', index + 1).slice(0, 5),
            durationMinutes: 240,
            price: String(1_500_000 + index * 90_000),
            isActive: true,
            sortOrder: 1,
          },
        ],
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
      { key: 'brand', label: 'Hãng', type: 'text', required: true, filterable: true, icon: 'Tag' },
      { key: 'model', label: 'Model', type: 'text', required: true, icon: 'Package' },
      {
        key: 'condition',
        label: 'Tình trạng',
        type: 'select',
        required: true,
        filterable: true,
        options: ['Mới', 'Rất tốt', 'Tốt'],
        icon: 'Check',
      },
      {
        key: 'insuranceIncluded',
        label: 'Kèm bảo hiểm',
        type: 'boolean',
        filterable: true,
        icon: 'Info',
      },
      { key: 'includedItems', label: 'Phụ kiện đi kèm', type: 'list', icon: 'Package' },
      { key: 'specs', label: 'Thông số nổi bật', type: 'list', icon: 'Cpu' },
      { key: 'rentalTerms', label: 'Điều khoản thuê', type: 'list', icon: 'ShieldCheck' },
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
      includedItems: [
        '02 pin và bộ sạc chính hãng',
        'Thẻ nhớ 128GB tốc độ cao',
        'Túi chống sốc và dây đeo',
        'Bộ vệ sinh ống kính',
      ],
      specs: [
        'Cảm biến full-frame 33MP',
        'Quay video 4K 60fps',
        'Chống rung 5 trục trong thân máy',
      ],
      rentalTerms: [
        'Đặt cọc theo giá trị thiết bị',
        'Kiểm tra kỹ thuật khi giao và nhận',
        'Bồi thường nếu hư hỏng do người thuê',
      ],
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
        icon: 'Shirt',
      },
      {
        key: 'size',
        label: 'Kích cỡ',
        type: 'multiselect',
        required: true,
        filterable: true,
        options: ['XS', 'S', 'M', 'L', 'XL'],
        icon: 'Tag',
      },
      {
        key: 'accessoriesIncluded',
        label: 'Kèm phụ kiện',
        type: 'boolean',
        filterable: true,
        icon: 'Gift',
      },
      { key: 'included', label: 'Dịch vụ kèm theo', type: 'list', icon: 'Check' },
      { key: 'careNotes', label: 'Lưu ý sử dụng', type: 'list', icon: 'Info' },
      { key: 'notIncluded', label: 'Không bao gồm', type: 'list', icon: 'CircleSlash' },
    ],
    title: (index, location) =>
      `Bộ ${cycle(COSTUME_STYLES, index)} ${location.shortName} ${String(index + 1).padStart(2, '0')}`,
    description: (index, location) =>
      `Trang phục ${cycle(COSTUME_STYLES, index).toLowerCase()} được vệ sinh và ủi hấp sau mỗi lượt thuê tại ${location.shortName}, có nhiều size, phụ kiện đồng bộ, thử đồ và hỗ trợ chỉnh sửa cơ bản.`,
    attributes: (index) => ({
      costumeStyle: cycle(COSTUME_STYLES, index),
      size: index % 2 === 0 ? ['S', 'M', 'L'] : ['M', 'L', 'XL'],
      accessoriesIncluded: true,
      included: [
        'Giặt hấp sạch sẽ sau mỗi lượt thuê',
        'Phụ kiện đồng bộ (giày, túi, trang sức)',
        'Hỗ trợ thử đồ và chỉnh sửa cơ bản',
      ],
      careNotes: [
        'Giữ trang phục sạch, tránh dây bẩn',
        'Không tự ý cắt sửa trang phục',
        'Hoàn trả đúng hạn để tránh phụ phí',
      ],
      notIncluded: ['Phí giặt nếu bẩn nặng hoặc hư hỏng', 'Dịch vụ giao tận nơi ngoài nội thành'],
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
    allowedModes: ['hourly'],
    defaultModes: ['hourly'],
    unitLabel: 'giờ',
    partner: 'service',
    bufferBefore: 30,
    bufferAfter: 60,
    depositPercent: 50,
    requiresIdentityVerification: true,
    attributeSchema: [
      {
        key: 'height',
        label: 'Chiều cao (cm)',
        type: 'number',
        required: true,
        filterable: true,
        icon: 'Users',
      },
      {
        key: 'experienceLevel',
        label: 'Kinh nghiệm',
        type: 'select',
        required: true,
        filterable: true,
        options: MODEL_LEVELS,
        icon: 'Trophy',
      },
      { key: 'languages', label: 'Ngôn ngữ', type: 'text', filterable: true, icon: 'BookOpen' },
      {
        key: 'travelReady',
        label: 'Có thể đi tỉnh',
        type: 'boolean',
        filterable: true,
        icon: 'Plane',
      },
      { key: 'measurements', label: 'Số đo', type: 'text', icon: 'Ruler' },
      { key: 'portfolio', label: 'Kinh nghiệm nổi bật', type: 'list', icon: 'Star' },
      { key: 'services', label: 'Nhận chụp', type: 'list', icon: 'Camera' },
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
      measurements: `Số đo 3 vòng: ${82 + (index % 6)}-${60 + (index % 5)}-${88 + (index % 6)} cm`,
      portfolio: [
        'Đã chụp lookbook cho nhiều local brand',
        'Kinh nghiệm quay TVC và ảnh quảng cáo',
        'Chụp ảnh cưới và ảnh gia đình',
      ],
      services: ['Chụp lookbook thời trang', 'Quảng cáo sản phẩm, TVC', 'Ảnh lifestyle và sự kiện'],
    }),
    modeConfig: (index) => ({
      hourly: {
        basePrice: String(450_000 + index * 25_000),
        packages: [],
        minDuration: 2,
        maxDuration: 8,
        granularity: 60,
        leadTimeMin: 360,
      },
    }),
    capacity: () => 1,
  },
];

export type CatalogTypes = {
  listingTypes: Map<string, Awaited<ReturnType<typeof upsertListingType>>>;
  categories: Map<string, Awaited<ReturnType<typeof upsertCategory>>>;
};

/**
 * Listing types + categories only — the tenant's CATALOG CONFIGURATION.
 *
 * Split from the listing generator below because production seeds the config
 * (partners cannot publish without a type to publish into) but never the demo
 * listings. See `seed/tenants/*` for the callers.
 */
export async function seedStudioCatalogTypes(
  prisma: PrismaClient,
  tenantId: string,
): Promise<CatalogTypes> {
  const listingTypes: CatalogTypes['listingTypes'] = new Map();
  const categories: CatalogTypes['categories'] = new Map();
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
  return { listingTypes, categories };
}

/** The 121 demo listings + studio groups. Dev/staging only. */
export async function seedDemoCatalog(input: {
  prisma: PrismaClient;
  tenantId: string;
  servicePartnerId: string;
  inventoryPartnerId: string;
  cancellationPolicyId: string;
  types: CatalogTypes;
}) {
  const { prisma, tenantId } = input;
  const { listingTypes, categories } = input.types;

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
      if (definition.allowedModes.includes('hourly')) {
        await ensureWeeklyRules(prisma, tenantId, listing.id);
      }
    }
  }

  const studioType = listingTypes.get('studio')!;
  const studioCategory = categories.get('studio')!;
  const draftGroupSlug = 'seed-draft-studio-group';
  const draftListingSlug = 'seed-draft-studio';
  desiredGroupSlugs.add(draftGroupSlug);
  desiredListingSlugs.add(draftListingSlug);
  await upsertStudioGroup(
    prisma,
    tenantId,
    input.servicePartnerId,
    studioType.id,
    draftGroupSlug,
    99,
    LOCATIONS[0]!,
    'draft',
  );
  await upsertListing(prisma, {
    tenantId,
    partnerId: input.servicePartnerId,
    listingTypeId: studioType.id,
    groupId: null,
    categoryId: studioCategory.id,
    cancellationPolicyId: input.cancellationPolicyId,
    title: 'Studio bản nháp — dữ liệu kiểm thử thủ công',
    slug: draftListingSlug,
    description: 'Fixture bền cho các smoke flow yêu cầu một listing chưa được xuất bản.',
    photos: photosFor('draft-studio', 1),
    bookingModes: ['hourly'],
    attributes: { area: 30, style: 'Tối giản', naturalLight: true, ceilingHeight: 3 },
    modeConfig: {
      hourly: { basePrice: '300000', minHours: 1, maxHours: 8, granularityMinutes: 60 },
    },
    capacity: 8,
    bufferBefore: 30,
    bufferAfter: 30,
    depositPercent: 50,
    location: LOCATIONS[0]!,
    status: 'draft',
  });

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

export async function upsertListingType(
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
    bookingSelection: definition.bookingSelection ?? 'flexible_duration',
    sortOrder,
    isActive: true,
    attributeSchema: definition.attributeSchema,
    searchConfig: searchConfigFor(definition),
    requiresIdentityVerification: definition.requiresIdentityVerification ?? false,
  };
  return prisma.listingType.upsert({
    where: { tenantId_slug: { tenantId, slug: definition.slug } },
    update: data,
    create: { tenantId, slug: definition.slug, ...data },
  });
}

function searchConfigFor(definition: CatalogDefinition): Prisma.InputJsonValue {
  const configured: Record<string, Prisma.InputJsonValue> = {
    studio: {
      schedule: 'hourly',
      showGuests: true,
      systemFacets: ['price', 'location', 'amenities'],
      attributeFacets: [
        {
          key: 'area',
          control: 'buckets',
          buckets: [
            { id: 'under-25', label: 'Dưới 25 m²', max: 25 },
            { id: '25-50', label: 'Từ 25 m² đến 50 m²', min: 25, max: 50 },
            { id: '50-100', label: 'Từ 50 m² đến 100 m²', min: 50, max: 100 },
            { id: 'over-100', label: 'Trên 100 m²', min: 100 },
          ],
        },
        { key: 'style', control: 'checkbox' },
        { key: 'naturalLight', control: 'checkbox' },
      ],
    },
    photography: {
      schedule: 'hourly',
      showGuests: true,
      systemFacets: ['price', 'location'],
      attributeFacets: [
        { key: 'photographyStyle', control: 'checkbox' },
        { key: 'rawFiles', control: 'checkbox' },
      ],
    },
    makeup: {
      schedule: 'hourly',
      showGuests: false,
      systemFacets: ['price', 'location'],
      attributeFacets: [
        { key: 'makeupStyle', control: 'checkbox' },
        { key: 'hairStyling', control: 'checkbox' },
      ],
    },
    equipment: {
      schedule: 'inventory',
      showGuests: false,
      systemFacets: ['price', 'location'],
      attributeFacets: [
        { key: 'brand', control: 'checkbox' },
        { key: 'condition', control: 'checkbox' },
        { key: 'insuranceIncluded', control: 'checkbox' },
      ],
    },
    costume: {
      schedule: 'inventory',
      showGuests: false,
      systemFacets: ['price', 'location'],
      attributeFacets: [{ key: 'costumeStyle', control: 'checkbox' }],
    },
    model: {
      schedule: 'hourly',
      showGuests: false,
      systemFacets: ['price', 'location'],
      attributeFacets: [{ key: 'experienceLevel', control: 'checkbox' }],
    },
  };
  return (
    definition.searchConfig ??
    configured[definition.slug] ?? {
      schedule: 'none',
      showGuests: false,
      systemFacets: ['price', 'location'],
      attributeFacets: [],
    }
  );
}

export async function upsertCategory(
  prisma: PrismaClient,
  tenantId: string,
  name: string,
  slug: string,
) {
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
  status: 'published' | 'draft' = 'published',
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
    status,
    publishedBy: status === 'published' ? ('partner' as const) : null,
    // Review aggregates are projections of persisted reviews only.
    ratingAvg: null,
    reviewCount: 0,
    bookingCount: 12 + index * 3,
  };
  return prisma.listingGroup.upsert({
    where: { tenantId_slug: { tenantId, slug } },
    update: data,
    create: { tenantId, slug, ...data },
  });
}

export async function upsertListing(
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
    status?: 'published' | 'draft';
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
    status: input.status ?? ('published' as const),
    publishedBy: input.status === 'draft' ? null : ('partner' as const),
    publishedAt: input.status === 'draft' ? null : new Date(),
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

export async function ensureWeeklyRules(
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

export function photosFor(kind: string, index: number): string[] {
  return Array.from(
    { length: 10 },
    (_, photoIndex) =>
      `https://picsum.photos/seed/bookingos-${kind}-${String(index).padStart(2, '0')}-${String(photoIndex + 1).padStart(2, '0')}/1600/1200`,
  );
}

/** Stable RFC 4122-shaped IDs keep package selections unchanged across seed reruns. */
function packageUuid(kind: 'photography' | 'makeup', index: number, variant: number): string {
  const kindCode = kind === 'photography' ? 1 : 2;
  const tail = [kindCode, index, variant]
    .map((value) => value.toString(16).padStart(4, '0'))
    .join('');
  return `00000000-0000-4000-8000-${tail}`;
}

export function cycle<T>(items: readonly T[], index: number): T {
  const value = items[index % items.length];
  if (value === undefined) throw new Error('Seed fixture collection must not be empty');
  return value;
}
