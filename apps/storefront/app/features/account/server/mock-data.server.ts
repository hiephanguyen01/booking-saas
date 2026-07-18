import type { Locale } from '@booking/i18n';
import { storefrontEnv } from '../../../lib/env.server';

export interface MockConversation {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
  messages: Array<{ from: 'me' | 'them'; text: string; time: string }>;
}
export interface MockListingCard {
  id: string;
  title: string;
  studio: string;
  location: string;
  price: string;
  rating: string;
}
export interface MockReview {
  id: string;
  status: 'pending' | 'reviewed';
  studio: string;
  bookingCode: string;
  listing: string;
  date: string;
  time: string;
  rating?: number;
  body?: string;
  response?: string;
}

export function accountMocksEnabled(): boolean {
  return !storefrontEnv.production;
}

export function mockConversations(locale: Locale): MockConversation[] {
  const en = locale === 'en';
  return [
    {
      id: 'dar-tawhid',
      name: 'Dar Tawhid Intercontinental Studio',
      preview: en ? 'Your booking is ready.' : 'Đơn đặt chỗ của bạn đã sẵn sàng.',
      time: '09:42',
      unread: 1,
      messages: [
        {
          from: 'them',
          text: en
            ? 'Hello! Your studio is ready for the scheduled time.'
            : 'Xin chào! Studio đã sẵn sàng theo lịch đặt của bạn.',
          time: '09:38',
        },
        {
          from: 'me',
          text: en ? 'Thank you, see you soon.' : 'Cảm ơn studio, hẹn gặp lại sớm.',
          time: '09:40',
        },
      ],
    },
    {
      id: 'wisteria',
      name: 'Studio Wisteria',
      preview: en ? 'Thanks for choosing us.' : 'Cảm ơn bạn đã lựa chọn chúng tôi.',
      time: en ? 'Yesterday' : 'Hôm qua',
      unread: 0,
      messages: [
        {
          from: 'them',
          text: en
            ? 'Thanks for choosing Studio Wisteria.'
            : 'Cảm ơn bạn đã lựa chọn Studio Wisteria.',
          time: '16:21',
        },
      ],
    },
  ];
}

export function mockListings(locale: Locale): MockListingCard[] {
  const en = locale === 'en';
  return [
    {
      id: 'premium-classic',
      title: en ? 'Premium neoclassical studio' : 'Phòng Premium phong cách tân cổ điển',
      studio: 'Dar Tawhid Intercontinental Studio',
      location: en ? 'District 1, Ho Chi Minh City' : 'Quận 1, TP. Hồ Chí Minh',
      price: '950.000 ₫',
      rating: '4.9',
    },
    {
      id: 'natural-light',
      title: en ? 'Natural light editorial room' : 'Phòng ánh sáng tự nhiên phong cách editorial',
      studio: 'Studio Wisteria',
      location: en ? 'District 3, Ho Chi Minh City' : 'Quận 3, TP. Hồ Chí Minh',
      price: '720.000 ₫',
      rating: '4.8',
    },
    {
      id: 'minimal-white',
      title: en ? 'Minimal white cyclorama' : 'Phòng cyclorama trắng tối giản',
      studio: 'Mây Studio',
      location: en ? 'Binh Thanh, Ho Chi Minh City' : 'Bình Thạnh, TP. Hồ Chí Minh',
      price: '580.000 ₫',
      rating: '4.7',
    },
  ];
}

export function mockReviews(locale: Locale): MockReview[] {
  const en = locale === 'en';
  return [
    {
      id: 'review-pending',
      status: 'pending',
      studio: 'Dar Tawhid Intercontinental Studio',
      bookingCode: 'BK-23A55K',
      listing: en ? 'Premium neoclassical studio' : 'Phòng Premium phong cách tân cổ điển',
      date: en ? 'Mon, 24 May 2024' : 'Thứ Hai, 24 tháng 05, 2024',
      time: '07:00 - 17:00 (2 ngày)',
    },
    {
      id: 'review-complete',
      status: 'reviewed',
      studio: 'Dar Tawhid Intercontinental Studio',
      bookingCode: 'BK-23B55M',
      listing: en ? 'Premium neoclassical studio' : 'Phòng Premium phong cách tân cổ điển',
      date: en ? 'Mon, 24 May 2024' : 'Thứ Hai, 24 tháng 05, 2024',
      time: '07:00 - 17:00 (2 ngày)',
      rating: 4,
      body: en
        ? 'Beautiful studio and thoughtful service. The location was a little hard to find, but everything else was excellent.'
        : 'Studio rất đẹp, phục vụ nhiệt tình. Giá cả hợp lý. Vị trí hơi khó tìm một chút, còn lại mọi thứ đều rất tốt.',
      response: en
        ? 'Thank you for trusting and supporting Studio Wisteria.'
        : 'Cảm ơn bạn vì đã tin tưởng và ủng hộ Studio Wisteria.',
    },
  ];
}
