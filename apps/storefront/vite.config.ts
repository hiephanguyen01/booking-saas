import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

// Ports are configured in the monorepo root .env (STOREFRONT_PORT), not the app dir.
const rootDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const port = Number(env.STOREFRONT_PORT ?? 5173);

  return {
    plugins: [tailwindcss(), reactRouter()],
    server: { port },
    preview: { port },
    // @booking/ui ships raw TSX; bundle @booking/contracts too so its JSON re-exports
    // are handled by Vite (Node's dev-SSR loader rejects assertion-less JSON imports).
    ssr: { noExternal: ['@booking/ui', '@booking/contracts'] },
  };
});
