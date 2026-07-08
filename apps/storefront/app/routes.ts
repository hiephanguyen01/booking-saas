import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('t/:typeSlug', 'routes/catalog.tsx'),
  route('l/:listingSlug', 'routes/listing.tsx'),
] satisfies RouteConfig;
