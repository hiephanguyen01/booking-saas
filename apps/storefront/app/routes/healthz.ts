export function loader() {
  return Response.json(
    { status: 'ok', service: 'storefront' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
