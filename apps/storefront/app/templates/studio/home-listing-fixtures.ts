import type { PublicListingResponse } from '@booking/contracts';

const STUDIOS = [
  ['The Moon Studio', 'Phường Bến Nghé', 'TP Hồ Chí Minh'],
  ['Lumière House', 'Phường Sài Gòn', 'TP Hồ Chí Minh'],
  ['Mây Concept Studio', 'Phường An Khánh', 'TP Hồ Chí Minh'],
  ['Nắng Creative Space', 'Phường Tân Định', 'TP Hồ Chí Minh'],
  ['Mộc Studio', 'Phường Cầu Giấy', 'Hà Nội'],
  ['The Light Room', 'Phường Hoàn Kiếm', 'Hà Nội'],
  ['April Photography', 'Phường Ba Đình', 'Hà Nội'],
  ['Maison 26', 'Phường Tây Hồ', 'Hà Nội'],
  ['Mira Studio', 'Phường Hải Châu', 'Đà Nẵng'],
  ['Oasis Space', 'Phường An Hải', 'Đà Nẵng'],
  ['Cielo Studio', 'Phường Hòa Cường', 'Đà Nẵng'],
  ['Pine Hill Studio', 'Phường Sa Pa', 'Lào Cai'],
  ['Cloud Nine Space', 'Phường Sa Pa', 'Lào Cai'],
  ['Misty Mountain Studio', 'Phường Sa Pa', 'Lào Cai'],
  ['Dahlia Studio', 'Phường Xuân Hương', 'Lâm Đồng'],
  ['The Attic Đà Lạt', 'Phường Cam Ly', 'Lâm Đồng'],
  ['Lá Studio', 'Phường Lang Biang', 'Lâm Đồng'],
  ['Red Brick House', 'Phường Bến Thành', 'TP Hồ Chí Minh'],
  ['Haru Daylight Studio', 'Phường Bạch Mai', 'Hà Nội'],
  ['Atelier 19', 'Phường Ngũ Hành Sơn', 'Đà Nẵng'],
  ['Bình Minh Studio', 'Phường Chợ Quán', 'TP Hồ Chí Minh'],
  ['Nordic Room', 'Phường Ô Chợ Dừa', 'Hà Nội'],
  ['Frame Studio', 'Phường Thanh Khê', 'Đà Nẵng'],
  ['Fern House', 'Phường Cam Ly', 'Lâm Đồng'],
  ['Silk Road Studio', 'Phường Sa Pa', 'Lào Cai'],
  ['Paper Plane Studio', 'Phường Phú Nhuận', 'TP Hồ Chí Minh'],
] as const;

const PHOTO_COUNT = 8;

/** Development/test catalog used only when the public listings endpoint is empty or unavailable. */
export const HOME_LISTING_FIXTURES: PublicListingResponse[] = STUDIOS.map(
  ([title, wardName, provinceName], index) => ({
    id: `home-fixture-${index + 1}`,
    kind: 'listing',
    title,
    slug: `home-fixture-${index + 1}`,
    listingTypeSlug: 'studio',
    attributes: { style: index % 2 === 0 ? 'Ánh sáng tự nhiên' : 'Phông nền đa dạng' },
    photos: [`/images/booking-studio/home/studio-${(index % PHOTO_COUNT) + 1}.jpg`],
    priceFrom: String(220_000 + (index % 5) * 30_000),
    itemLabel: 'studio',
    provinceCode: null,
    provinceName,
    wardCode: null,
    wardName,
    address: `${18 + index} đường Nguyễn Văn Trỗi`,
  }),
);
