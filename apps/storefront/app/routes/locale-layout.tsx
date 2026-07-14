import { Outlet, useOutletContext } from 'react-router';
import type { Route } from './+types/locale-layout';
import type { StorefrontContext } from '../root';

export function loader({ params }: Route.LoaderArgs) {
  if (params.locale !== 'vi' && params.locale !== 'en') {
    throw new Response('Locale not found', { status: 404 });
  }
  return { locale: params.locale };
}

export default function LocaleLayout() {
  const context = useOutletContext<StorefrontContext>();
  return <Outlet context={context} />;
}
