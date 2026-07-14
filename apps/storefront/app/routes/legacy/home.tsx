import type { Route } from './+types/home';
import { storefrontPaths } from '../../lib/locale-paths';
import { redirectLegacy } from './redirect.server';
export function loader({ request }: Route.LoaderArgs) { return redirectLegacy(request, storefrontPaths.home); }
export default function LegacyHome() { return null; }
