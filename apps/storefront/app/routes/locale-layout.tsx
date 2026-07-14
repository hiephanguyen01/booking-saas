import { Outlet } from 'react-router';
import type { Route } from './+types/locale-layout';

export function loader({ params }: Route.LoaderArgs) {
  if (params.locale !== 'vi' && params.locale !== 'en') {
    throw new Response('Locale not found', { status: 404 });
  }
  return { locale: params.locale };
}

export default function LocaleLayout() {
  return <Outlet />;
}
