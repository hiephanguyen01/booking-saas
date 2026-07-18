import { redirect } from 'react-router';
import type { Locale } from '@booking/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import type { Route } from './+types/_index';

export function loader({ params }: Route.LoaderArgs) {
  throw redirect(storefrontPaths.account.profile(params.locale as Locale));
}

export default function AccountIndex() {
  return null;
}
