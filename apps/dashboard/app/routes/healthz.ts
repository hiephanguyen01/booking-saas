export function loader() {
  return Response.json(
    { status: 'ok', service: 'dashboard' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
