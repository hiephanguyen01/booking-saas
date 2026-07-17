import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

// Ports are configured in the monorepo root .env (DASHBOARD_PORT), not the app dir.
const rootDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }
  const port = Number(process.env.DASHBOARD_PORT ?? env.DASHBOARD_PORT ?? 5174);
  // `HOST=0.0.0.0`/`true` → pass boolean `true` so Vite's HMR client connects back
  // via the page's own host (e.g. a LAN IP). A literal '0.0.0.0' host makes the HMR
  // websocket target ws://0.0.0.0, which a browser can't reach — that breaks client
  // hydration over LAN, so the JS-driven login form silently stops working.
  const host =
    process.env.HOST === '0.0.0.0' || process.env.HOST === 'true' ? true : process.env.HOST;

  return {
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
      alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
    },
    server: { host, port },
    preview: { port },
    // @booking/ui ships raw TSX — let Vite compile it for SSR instead of externalizing.
    ssr: { noExternal: ['@booking/ui'] },
  };
});
