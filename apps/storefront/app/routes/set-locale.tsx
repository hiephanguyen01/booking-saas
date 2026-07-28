import { handleSetLocaleAction } from '~/features/root/server/set-locale-route.server';
import type { Route } from './+types/set-locale';

/** Language switcher target — sets the `sf_locale` cookie and redirects back. */
export async function action({ request }: Route.ActionArgs) {
  return handleSetLocaleAction(request);
}

// Action-only route — no default component needed.
export default function SetLocale() {
  return null;
}
