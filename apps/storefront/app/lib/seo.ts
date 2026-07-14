import { switchLocalePath } from './locale-paths';

const trackingParameters = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
]);

export function canonicalUrl(input: URL): string {
  const output = new URL(input);
  output.hash = '';
  for (const key of [...output.searchParams.keys()]) {
    if (trackingParameters.has(key)) output.searchParams.delete(key);
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
