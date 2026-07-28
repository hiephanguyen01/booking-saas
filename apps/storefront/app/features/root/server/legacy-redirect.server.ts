import type { Locale } from '@booking/i18n';
import { redirect } from 'react-router';
import { resolveLocale } from '~/lib/server/i18n.server';

export function redirectLegacy(request: Request, path: (locale: Locale) => string): never {
  const source = new URL(request.url);
  const destination = new URL(path(resolveLocale(request, 'vi')), source.origin);
  destination.search = source.search;
  throw redirect(`${destination.pathname}${destination.search}`, { status: 308 });
}
