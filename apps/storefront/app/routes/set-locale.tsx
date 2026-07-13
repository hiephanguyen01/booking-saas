import { redirect } from 'react-router';
import type { Route } from './+types/set-locale';
import { localeCookie, isLocale } from '../lib/i18n.server';

/** Language switcher target — sets the `sf_locale` cookie and redirects back. */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const locale = form.get('locale');
  const redirectToRaw = form.get('redirectTo');
  // Only allow same-site path redirects (never an absolute URL).
  const redirectTo =
    typeof redirectToRaw === 'string' && redirectToRaw.startsWith('/') ? redirectToRaw : '/';

  if (!isLocale(locale)) return redirect(redirectTo);
  return redirect(redirectTo, { headers: { 'Set-Cookie': localeCookie(locale) } });
}

// Action-only route — no default component needed.
export default function SetLocale() {
  return null;
}
