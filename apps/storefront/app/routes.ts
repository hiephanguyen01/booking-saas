import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  route(':locale', 'routes/locale-layout.tsx', [
    index('routes/home.tsx'),
    route('t/:typeSlug', 'routes/catalog.tsx'),
    route('l/:listingSlug', 'routes/listing.tsx'),
    route('checkout', 'routes/checkout.tsx'),
    route('bookings', 'routes/bookings.tsx'),
    route('bookings/:code', 'routes/booking-detail.tsx'),
    layout('routes/_partner-layout.tsx', [
      route('become-partner', 'routes/become-partner.tsx'),
      route('become-affiliate', 'routes/become-affiliate.tsx'),
    ]),
  ]),
  index('routes/legacy/home.tsx'),
  route('t/:typeSlug', 'routes/legacy/catalog.tsx'),
  route('l/:listingSlug', 'routes/legacy/listing.tsx'),
  route('checkout', 'routes/legacy/checkout.tsx'),
  route('bookings', 'routes/legacy/bookings.tsx'),
  route('bookings/:code', 'routes/legacy/booking-detail.tsx'),
  route('become-partner', 'routes/legacy/become-partner.tsx'),
  route('become-affiliate', 'routes/legacy/become-affiliate.tsx'),
  route('set-locale', 'routes/set-locale.tsx'),
  route('sitemap.xml', 'routes/sitemap[.]xml.tsx'),
  route('robots.txt', 'routes/robots[.]txt.tsx'),
] satisfies RouteConfig;
