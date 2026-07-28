import { redirect } from 'react-router';
import { formRequestFailureStatus, readFormRequestBody } from '~/lib/form-request.server';
import { isLocale, localeCookie } from '~/lib/i18n.server';
import { safeRedirectPath } from '~/lib/safe-redirect';

const MAX_LOCALE_FORM_BYTES = 4 * 1024;

export async function handleSetLocaleAction(request: Request) {
  const body = await readFormRequestBody(request, MAX_LOCALE_FORM_BYTES);
  if (!body.ok) {
    return new Response(null, { status: formRequestFailureStatus(body.code) });
  }

  const locale = body.value.get('locale');
  const redirectTo = safeRedirectPath(body.value.get('redirectTo'));

  if (!isLocale(locale)) return redirect(redirectTo);
  return redirect(redirectTo, { headers: { 'Set-Cookie': localeCookie(locale) } });
}
