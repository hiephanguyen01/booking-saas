import { redirect } from 'react-router';
import type { Locale } from '@booking/i18n';
import { resolveLocale } from '../../lib/i18n.server';

export function redirectLegacy(request: Request, path: (locale: Locale) => string): never {
  throw redirect(path(resolveLocale(request, 'vi')), { status: 302 });
}
