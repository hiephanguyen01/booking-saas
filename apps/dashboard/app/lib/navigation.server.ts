export function normalizedRequestLocation(request: Request): string {
  const url = new URL(request.url);

  if (url.pathname.endsWith('.data')) {
    url.pathname = url.pathname.slice(0, -'.data'.length) || '/';
  }

  url.searchParams.delete('_routes');
  url.searchParams.delete('index');

  return `${url.pathname}${url.search}${url.hash}`;
}
