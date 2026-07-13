import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('t/:typeSlug', 'routes/catalog.tsx'),
  route('l/:listingSlug', 'routes/listing.tsx'),
  route('checkout', 'routes/checkout.tsx'),
  route('bookings', 'routes/bookings.tsx'),
  route('bookings/:code', 'routes/booking-detail.tsx'),
  route('become-partner', 'routes/become-partner.tsx'),
  route('set-locale', 'routes/set-locale.tsx'),
  route('sitemap.xml', 'routes/sitemap[.]xml.tsx'),
  route('robots.txt', 'routes/robots[.]txt.tsx'),
] satisfies RouteConfig;
