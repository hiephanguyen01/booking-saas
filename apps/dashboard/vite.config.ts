import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

// Ports are configured in the monorepo root .env (DASHBOARD_PORT), not the app dir.
const rootDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const port = Number(env.DASHBOARD_PORT ?? 5174);

  return {
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
      alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
    },
    server: { port },
    preview: { port },
    // @booking/ui ships raw TSX — let Vite compile it for SSR instead of externalizing.
    ssr: { noExternal: ['@booking/ui'] },
  };
});
