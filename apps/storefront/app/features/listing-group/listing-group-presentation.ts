export interface PresentationReview {
  id: string;
  author: string;
  initials: string;
  rating: number;
  date: string;
  content: string;
  reply?: string;
}

export interface ListingGroupPresentation {
  rating: number;
  reviewCount: number;
  promotions: string[];
  reviews: PresentationReview[];
  policies: string[];
}

const PRESENTATION: ListingGroupPresentation = {
  rating: 4.9,
  reviewCount: 28,
  promotions: [
    'Ưu đãi theo khung giờ đang áp dụng trực tiếp trong giá hiển thị',
    'Giữ lịch nhanh sau khi hoàn tất tiền đặt cọc',
  ],
  policies: [
    'Đặt cọc theo chính sách của từng phòng',
    'Có thể đổi lịch khi studio xác nhận còn khung giờ trống',
    'Thông tin liên hệ được bảo vệ đến khi booking được xác nhận',
  ],
  reviews: [
    {
      id: 'review-1',
      author: 'Minh Anh',
      initials: 'MA',
      rating: 5,
      date: '12/06/2026',
      content: 'Không gian sạch, ánh sáng đẹp và ekip hỗ trợ rất nhanh. Phòng thực tế đúng với hình ảnh.',
      reply: 'Cảm ơn bạn đã lựa chọn studio. Hẹn gặp lại bạn trong buổi chụp tiếp theo!',
    },
    {
      id: 'review-2',
      author: 'Hoàng Nam',
      initials: 'HN',
      rating: 5,
      date: '28/05/2026',
      content: 'Khâu nhận phòng thuận tiện, nhiều thiết bị có sẵn và vị trí dễ tìm.',
    },
    {
      id: 'review-3',
      author: 'Thanh Vy',
      initials: 'TV',
      rating: 4,
      date: '09/05/2026',
      content: 'Studio rộng rãi, nhiều góc chụp. Mình sẽ quay lại khi có dự án mới.',
    },
  ],
};

/** Stable mock copy for presentation-only sections until their APIs are available. */
export function listingGroupPresentation(): ListingGroupPresentation {
  return PRESENTATION;
}
