import { redirect } from 'react-router';
import { requireLocale } from '../../lib/i18n.server';
import { storefrontPaths } from '../../lib/locale-paths';
import type { Route } from './+types/_index';

export function loader({ params }: Route.LoaderArgs) {
  throw redirect(storefrontPaths.account.profile(requireLocale(params.locale)));
}

export default function AccountIndex() {
  return null;
}
