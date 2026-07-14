/**
 * Base Vite config for React Router 7 apps in this monorepo.
 *
 * Usage in each app's vite.config.ts:
 *   import { createReactRouterConfig } from '@booking/config/vite/react';
 *   export default createReactRouterConfig({ port: 5174 });
 *
 * Note: Each app still imports this factory and can extend/override.
 * The factory is a convenience, not a requirement.
 */

import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type UserConfigExport } from 'vite';

export interface ReactRouterConfigOptions {
  /** Port to serve on in dev and preview. */
  port?: number;
  /** Absolute path to load .env from (defaults to monorepo root = 2 dirs up). */
  envDir?: string;
  /** Extra SSR noExternal entries (always includes @booking/ui). */
  noExternal?: string[];
  /** Extra Vite aliases. */
  alias?: Record<string, string>;
}

export function createReactRouterConfig(opts: ReactRouterConfigOptions = {}): UserConfigExport {
  return defineConfig(({ mode }) => {
    const envDir = opts.envDir ?? fileURLToPath(new URL('../..', import.meta.url));
    const env = loadEnv(mode, envDir, '');
    const port = opts.port ?? Number(env.VITE_PORT ?? 5173);

    return {
      plugins: [tailwindcss(), reactRouter()],
      resolve: {
        alias: {
          '~': fileURLToPath(new URL('./app', import.meta.url)),
          ...opts.alias,
        },
      },
      server: { port },
      preview: { port },
      ssr: {
        noExternal: ['@booking/ui', ...(opts.noExternal ?? [])],
      },
    };
  });
}
