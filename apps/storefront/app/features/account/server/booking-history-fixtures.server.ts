import type { BookingResponse, BookingStatus } from '@booking/contracts';
import type { AccountBookingFixture } from '../lib/booking-history';

const CUSTOMER = {
  id: 'demo-customer',
  fullName: 'Nguyen Thi Hoang Anh',
  phone: '0922333882',
  email: 'anhvdasdh@gmail.com',
};

const PRESENTATION: AccountBookingFixture['presentation'] = {
  studioName: 'Dar Tawhid Intercontinental Studio',
  imageUrl: '/images/booking-studio/home/studio-1.jpg',
  paymentMethod: 'Chuyển khoản',
  attributes: [
    { label: 'Diện tích', value: '50 m² (D: 10 m; R: 5 m; C: 4 m)' },
    { label: 'Background', value: 'backdrop trắng, đen, xanh' },
    { label: 'Thiết bị đèn', value: 'reflector, strobe' },
    { label: 'Nội thất', value: 'đèn trần, bàn tròn, sofa nhung đỏ, máy tính bàn' },
    { label: 'Trang trí', value: 'cổng hoa giấy' },
  ],
  amenities: [
    'Máy lạnh',
    'Quạt trần',
    'Máy lọc không khí',
    'Tủ lạnh mini',
    'Phòng thay đồ riêng',
    'Gương',
    'Giá treo quần áo',
    'Cách âm',
  ],
  description:
    'Không gian studio rộng rãi, đầy đủ thiết bị và tiện nghi cho buổi chụp chuyên nghiệp.',
};

function booking(
  code: string,
  status: BookingStatus,
  startUtc: string,
  endUtc: string,
): BookingResponse {
  return {
    id: `fixture-${code.toLowerCase()}`,
    code,
    status,
    listingId: 'demo-listing',
    listingTitle: 'Phòng Premium phong cách tân cổ điển',
    resourceId: 'demo-resource',
    partnerId: 'demo-partner',
    bookingMode: 'hourly',
    startUtc,
    endUtc,
    guestCount: 2,
    quantity: 1,
    totalAmount: '950000',
    discountAmount: '150000',
    finalAmount: '800000',
    depositAmount: '400000',
    paidAmount: status === 'pending_payment' ? '0' : '400000',
    refundDueAmount: null,
    refundPercent: null,
    securityDeposit: '0',
    pickedUpAt: null,
    returnedAt: null,
    damageAmount: '0',
    additionalCharges: [],
    promoCode: 'STUDIO20',
    promotionSnapshot: null,
    cancellationPolicySnapshot: [
      { hoursBefore: 24, refundPercent: 100 },
      { hoursBefore: 0, refundPercent: 50 },
    ],
    customerNote: null,
    expiresAt: status === 'pending_payment' ? '2026-08-23T08:15:00.000Z' : null,
    createdAt: '2026-07-01T03:00:00.000Z',
    updatedAt: '2026-07-01T03:00:00.000Z',
    customer: CUSTOMER,
    pricingSnapshot: {
      currency: 'VND',
      mode: 'hourly',
      subtotal: '950000',
      depositAmount: '400000',
      securityDeposit: '0',
      lineItems: [],
    },
  };
}

export const ACCOUNT_BOOKING_FIXTURES: Record<string, AccountBookingFixture> = {
  'DEMO-PAYMENT': {
    booking: booking(
      'DEMO-PAYMENT',
      'pending_payment',
      '2026-08-24T00:00:00.000Z',
      '2026-08-24T02:00:00.000Z',
    ),
    presentation: PRESENTATION,
  },
  'DEMO-UPCOMING': {
    booking: booking(
      'DEMO-UPCOMING',
      'confirmed',
      '2026-08-24T00:00:00.000Z',
      '2026-08-24T02:00:00.000Z',
    ),
    presentation: PRESENTATION,
  },
  'DEMO-COMPLETED': {
    booking: booking(
      'DEMO-COMPLETED',
      'completed',
      '2026-05-24T00:00:00.000Z',
      '2026-05-24T02:00:00.000Z',
    ),
    presentation: { ...PRESENTATION, review: { state: 'pending' } },
  },
  'DEMO-REVIEWED': {
    booking: booking(
      'DEMO-REVIEWED',
      'completed',
      '2026-05-24T00:00:00.000Z',
      '2026-05-24T02:00:00.000Z',
    ),
    presentation: {
      ...PRESENTATION,
      review: {
        state: 'reviewed',
        rating: 5,
        body: 'Studio rất đẹp, phục vụ nhiệt tình. Giá cả hợp lý và mọi người đều rất hài lòng.',
        response: 'Cảm ơn bạn vì đã tin tưởng và ủng hộ Studio Wisteria.',
        photos: [
          '/images/booking-studio/home/studio-2.jpg',
          '/images/booking-studio/home/studio-3.jpg',
          '/images/booking-studio/home/studio-4.jpg',
        ],
      },
    },
  },
  'DEMO-CANCELLED': {
    booking: booking(
      'DEMO-CANCELLED',
      'cancelled',
      '2026-06-24T00:00:00.000Z',
      '2026-06-24T02:00:00.000Z',
    ),
    presentation: {
      ...PRESENTATION,
      refundAmount: '200000',
      refundPercent: 50,
      cancelledAt: '2026-06-13T07:02:00.000Z',
      cancellationReason: 'Thay đổi lịch trình',
    },
  },
  'DEMO-NOSHOW': {
    booking: booking(
      'DEMO-NOSHOW',
      'no_show',
      '2026-07-10T00:00:00.000Z',
      '2026-07-10T02:00:00.000Z',
    ),
    presentation: { ...PRESENTATION, refundAmount: '0', refundPercent: 0 },
  },
};

export const ACCOUNT_BOOKING_LIST_FIXTURES = [
  ACCOUNT_BOOKING_FIXTURES['DEMO-UPCOMING'],
  ACCOUNT_BOOKING_FIXTURES['DEMO-PAYMENT'],
  ACCOUNT_BOOKING_FIXTURES['DEMO-REVIEWED'],
  ACCOUNT_BOOKING_FIXTURES['DEMO-CANCELLED'],
  ACCOUNT_BOOKING_FIXTURES['DEMO-NOSHOW'],
];
