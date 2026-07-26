import { redirect } from 'react-router';
import { formRequestFailureStatus, readFormRequestBody } from '../lib/form-request.server';
import { localeCookie, isLocale } from '../lib/i18n.server';
import { safeRedirectPath } from '../lib/safe-redirect';
import type { Route } from './+types/set-locale';

const MAX_LOCALE_FORM_BYTES = 4 * 1024;

/** Language switcher target — sets the `sf_locale` cookie and redirects back. */
export async function action({ request }: Route.ActionArgs) {
  const body = await readFormRequestBody(request, MAX_LOCALE_FORM_BYTES);
  if (!body.ok) {
    return new Response(null, { status: formRequestFailureStatus(body.code) });
  }

  const locale = body.value.get('locale');
  const redirectTo = safeRedirectPath(body.value.get('redirectTo'));

  if (!isLocale(locale)) return redirect(redirectTo);
  return redirect(redirectTo, { headers: { 'Set-Cookie': localeCookie(locale) } });
}

// Action-only route — no default component needed.
export default function SetLocale() {
  return null;
}
