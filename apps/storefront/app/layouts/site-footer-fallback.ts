/**
 * Presentation-only data that is not available in the tenant contract yet.
 * Keep it centralized so backend fields can replace each fallback independently.
 */
export const SITE_FOOTER_FALLBACK = {
  appBadges: [
    {
      name: 'App Store',
      src: '/images/booking-studio/app-store.svg',
      alt: 'Download on the App Store',
      width: 132,
      height: 44,
    },
    {
      name: 'Google Play',
      src: '/images/booking-studio/google-play.svg',
      alt: 'Get it on Google Play',
      width: 149,
      height: 44,
    },
  ],
  socialProfiles: [
    {
      name: 'Facebook',
      src: '/images/booking-studio/facebook.svg',
      tenantKey: 'facebook',
    },
    {
      name: 'Instagram',
      src: '/images/booking-studio/instagram.svg',
      tenantKey: 'instagram',
    },
    {
      name: 'LinkedIn',
      src: '/images/booking-studio/linkedin.svg',
      tenantKey: null,
    },
  ],
  legalBadge: {
    src: '/images/booking-studio/ministry-of-industry-and-trade.svg',
    alt: 'Đã đăng ký Bộ Công Thương',
    width: 130,
    height: 40,
  },
} as const;
