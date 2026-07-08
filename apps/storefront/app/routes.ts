import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('t/:typeSlug', 'routes/catalog.tsx'),
] satisfies RouteConfig;
