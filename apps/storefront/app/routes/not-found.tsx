export function loader(): never {
  throw new Response('Page not found', { status: 404 });
}

export default function NotFoundRoute() {
  return null;
}
