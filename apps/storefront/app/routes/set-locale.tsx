import { redirect } from 'react-router';
import type { Route } from './+types/set-locale';
import { localeCookie, isLocale } from '../lib/i18n.server';
import { safeRedirectPath } from '../lib/safe-redirect';

/** Language switcher target — sets the `sf_locale` cookie and redirects back. */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const locale = form.get('locale');
  const redirectTo = safeRedirectPath(form.get('redirectTo'));

  if (!isLocale(locale)) return redirect(redirectTo);
  return redirect(redirectTo, { headers: { 'Set-Cookie': localeCookie(locale) } });
}

// Action-only route — no default component needed.
export default function SetLocale() {
  return null;
}
