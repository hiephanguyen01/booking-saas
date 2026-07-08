import { isRouteErrorResponse, Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { Route } from './+types/root';
import './app.css';

export function meta() {
  return [{ title: 'Bookify Dashboard' }];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-gray-50">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

const areas = [
  { to: '/admin', label: 'Platform Admin' },
  { to: '/tenant', label: 'Tenant' },
  { to: '/partner', label: 'Partner' },
  { to: '/affiliate', label: 'Affiliate' },
];

export default function App() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-gray-200 bg-white p-4">
        <p className="mb-4 text-lg font-bold">Bookify</p>
        <nav className="flex flex-col gap-1">
          {areas.map((area) => (
            <NavLink
              key={area.to}
              to={area.to}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm ${isActive ? 'bg-sky-100 font-medium text-sky-800' : 'text-gray-700 hover:bg-gray-100'}`
              }
            >
              {area.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'Đã có lỗi xảy ra';
  return (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-2xl font-semibold">{message}</h1>
    </main>
  );
}
