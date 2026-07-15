import type { ListingCardPresentation } from '../catalog/components/listing-card';

export interface PresentationReview {
  id: string;
  author: string;
  initials: string;
  rating: 1 | 2 | 3 | 4 | 5;
  date: string;
  content: string;
  roomName?: string;
  photos: string[];
  reply?: string;
}

export interface ListingGroupPresentation {
  rating: number;
  reviewCount: number;
  bookingCount: number;
  promotion: string;
  reviews: PresentationReview[];
  reviewDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  policies: string[];
}

const REVIEW_COPY = [
  {
    author: 'Mai Anh',
    rating: 5 as const,
    content:
      'Studio rất đẹp, phục vụ nhiệt tình. Giá cả cũng hợp lý. Mình và chồng đều hài lòng với trải nghiệm tại đây.',
    reply: 'Cảm ơn bạn đã tin tưởng và ủng hộ studio. Hẹn gặp lại bạn trong buổi chụp tiếp theo!',
  },
  {
    author: 'Ly Minh',
    rating: 5 as const,
    content:
      'Không gian sạch, ánh sáng đẹp và ekip hỗ trợ rất nhanh. Phòng thực tế đúng với hình ảnh.',
    reply: 'Cảm ơn bạn đã dành thời gian đánh giá. Studio rất vui vì đã đồng hành cùng bạn.',
  },
  {
    author: 'Hoàng Nam',
    rating: 4 as const,
    content: 'Khâu nhận phòng thuận tiện, nhiều thiết bị có sẵn và vị trí dễ tìm.',
  },
  {
    author: 'Thanh Vy',
    rating: 5 as const,
    content: 'Studio rộng rãi, nhiều góc chụp. Mình sẽ quay lại khi có dự án mới.',
  },
  {
    author: 'Minh Khoa',
    rating: 3 as const,
    content: 'Không gian đúng mô tả, nhân viên hỗ trợ nhanh và quy trình nhận phòng rõ ràng.',
  },
  {
    author: 'Ngọc Hà',
    rating: 5 as const,
    content: 'Thiết bị đầy đủ, phòng sạch và ảnh chụp lên màu rất đẹp.',
  },
];

const POLICIES = [
  'Đặt cọc theo chính sách của từng phòng',
  'Hủy miễn phí trước thời hạn quy định',
  'Thông tin liên hệ được bảo vệ đến khi booking được xác nhận',
];

/** Deterministic presentation-only data until ratings, reviews and promotions have public APIs. */
export function listingGroupPresentation(
  identity: string,
  photos: string[] = [],
  roomName?: string,
): ListingGroupPresentation {
  const seed = stableHash(identity || 'studio');
  const reviewCount = 36 + (seed % 28);
  const rating = Number((4.6 + ((seed >>> 3) % 4) / 10).toFixed(1));
  const fiveStars = Math.max(1, Math.round(reviewCount * (rating >= 4.8 ? 0.72 : 0.64)));
  const fourStars = Math.max(1, Math.round(reviewCount * 0.2));
  const remaining = Math.max(0, reviewCount - fiveStars - fourStars);
  const threeStars = Math.round(remaining * 0.55);
  const twoStars = Math.round((remaining - threeStars) * 0.6);
  const oneStar = remaining - threeStars - twoStars;

  const reviews = REVIEW_COPY.map((review, index) => ({
    ...review,
    id: `${identity || 'studio'}-review-${index + 1}`,
    initials: initials(review.author),
    date: `${index + 1} tuần trước`,
    roomName,
    photos: index < 2 ? rotate(photos, seed + index).slice(0, index === 0 ? 3 : 2) : [],
  }));

  return {
    rating,
    reviewCount,
    bookingCount: 180 + (seed % 220),
    promotion: `${8 + (seed % 8)}%`,
    reviews,
    reviewDistribution: { 1: oneStar, 2: twoStars, 3: threeStars, 4: fourStars, 5: fiveStars },
    policies: POLICIES,
  };
}

export function filterPresentationReviews(
  reviews: PresentationReview[],
  rating: number | null,
): PresentationReview[] {
  return rating === null ? reviews : reviews.filter((review) => review.rating === rating);
}

export function paginatePresentationReviews(
  reviews: PresentationReview[],
  visibleCount: number,
): PresentationReview[] {
  return reviews.slice(0, Math.max(0, visibleCount));
}

export function relatedListingPresentation(
  identity: string,
  price: string | null,
): ListingCardPresentation {
  const seed = stableHash(identity || 'listing');
  const discountPercent = 10 + (seed % 3) * 5;
  const numericPrice = Number(price);
  const originalPrice =
    Number.isFinite(numericPrice) && numericPrice > 0
      ? String(Math.round(numericPrice / (1 - discountPercent / 100)))
      : null;
  return {
    rating: Number((4.5 + ((seed >>> 2) % 5) / 10).toFixed(1)),
    bookingCount: 120 + (seed % 240),
    discountPercent,
    originalPrice,
    priceUnit: 'ngày',
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rotate<T>(items: T[], seed: number): T[] {
  if (!items.length) return [];
  const start = seed % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
