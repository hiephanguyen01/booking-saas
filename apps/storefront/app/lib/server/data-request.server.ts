/**
 * React Router's single-fetch transport detail, in one place.
 *
 * A client-side navigation to `/en` does not request `/en` — it requests
 * `/en.data` and renders the result. Any server code that reads meaning out of
 * the pathname (which locale this is, whether the path is allowlisted) therefore
 * has to look past the suffix, or it will treat a client navigation as a
 * different URL than the full page load it is supposed to be equivalent to.
 */
const DATA_REQUEST_SUFFIX = '.data';

export function isDataRequestPath(pathname: string): boolean {
  return pathname.endsWith(DATA_REQUEST_SUFFIX);
}

/** The page path a request is really about, with the single-fetch suffix removed. */
export function documentPathname(pathname: string): string {
  return isDataRequestPath(pathname) ? pathname.slice(0, -DATA_REQUEST_SUFFIX.length) : pathname;
}
