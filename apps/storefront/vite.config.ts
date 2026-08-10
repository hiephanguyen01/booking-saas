import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

// Ports are configured in the monorepo root .env (STOREFRONT_PORT), not the app dir.
const rootDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }
  const port = Number(process.env.STOREFRONT_PORT ?? env.STOREFRONT_PORT ?? 5173);
  const buildId =
    process.env.STOREFRONT_BUILD_ID?.trim() ||
    `local-${new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, 14)}`;
  // `HOST=0.0.0.0`/`true` → boolean `true` so Vite's HMR client uses the page host
  // (LAN IP) instead of an unreachable ws://0.0.0.0. See dashboard vite.config.ts.
  const host =
    process.env.HOST === '0.0.0.0' || process.env.HOST === 'true' ? true : process.env.HOST;

  return {
    plugins: [tailwindcss(), reactRouter()],
    define: { __STOREFRONT_BUILD_ID__: JSON.stringify(buildId) },
    resolve: {
      alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
    },
    server: { host, port },
    preview: { port },
    // @booking/ui ships raw TSX and is compiled by the consuming app.
    ssr: { noExternal: ['@booking/ui'] },
  };
});
