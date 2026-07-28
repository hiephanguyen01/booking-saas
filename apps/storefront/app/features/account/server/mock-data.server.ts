import type { Locale } from '@booking/i18n';
import { storefrontEnv } from '~/lib/env.server';

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
