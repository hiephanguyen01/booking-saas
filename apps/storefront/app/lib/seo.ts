import { switchLocalePath } from '~/constants/paths';

const trackingParameters = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
]);

/**
 * Query parameters that represent transient UI, booking, attribution, or filter
 * state rather than a distinct indexable document.
 */
const nonCanonicalParameters = new Set([
  'ref',
  'mode',
  'day',
  'date',
  'from',
  'to',
  'start',
  'end',
  'starttime',
  'endtime',
  'qty',
  'quantity',
  'packageid',
  'promo',
  'rating',
  'reviewlimit',
  'q',
  'location',
  'amenities',
  'guests',
  'minprice',
  'maxprice',
  'minrating',
  'area',
  'sort',
  'pagesize',
]);

export function canonicalUrl(input: URL): string {
  const output = new URL(input);
  output.hash = '';
  let removedState = false;

  for (const key of [...output.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    const isTracking = trackingParameters.has(normalized);
    const isState = nonCanonicalParameters.has(normalized) || normalized.startsWith('attr.');
    const isEmpty = output.searchParams.getAll(key).every((value) => value.trim() === '');

    if (isTracking || isState || isEmpty) {
      output.searchParams.delete(key);
      removedState ||= isState;
    }
  }

  // A filtered result's page number belongs to that filter state. Once the
  // filter is removed, canonicalize back to the base catalog page rather than a
  // potentially unrelated page of the unfiltered catalog.
  if (removedState) {
    for (const key of [...output.searchParams.keys()]) {
      if (key.toLowerCase() === 'page') output.searchParams.delete(key);
    }
  }

  return output.toString();
}

export function localizedAlternates(input: URL) {
  const clean = new URL(canonicalUrl(input));
  const suffix = `${clean.pathname}${clean.search}`;
  return {
    vi: new URL(switchLocalePath(suffix, 'vi'), clean.origin).toString(),
    en: new URL(switchLocalePath(suffix, 'en'), clean.origin).toString(),
    default: new URL(switchLocalePath(suffix, 'vi'), clean.origin).toString(),
  };
}

export function requestPublicUrl(request: Request, url: URL): URL {
  const output = new URL(url);
  // Host is the same value already validated by tenant resolution. Do not trust
  // an arbitrary forwarded host when constructing canonical URLs.
  const host = request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto');
  if (host) output.host = host.split(',')[0]!.trim();
  if (proto === 'http' || proto === 'https') output.protocol = `${proto}:`;
  return output;
}

export function jsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
