import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Use-case unit tests (ADR 0009).
 *
 * SWC rather than esbuild: a use-case file carries `@Injectable()` and
 * `@Inject(TOKEN)`, and esbuild implements neither legacy decorators nor
 * `emitDecoratorMetadata`. A test constructs the class directly
 * (`new XxxUseCase(fakePort, …)`) rather than through the Nest container, but
 * the decorators still have to evaluate.
 *
 * `@booking/contracts` resolves to its source so the suite runs straight after
 * `pnpm install`, without waiting on that package's build.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  resolve: {
    alias: [
      { find: /^~testing$/, replacement: here('./testing/index.ts') },
      { find: /^@booking\/contracts$/, replacement: here('../../packages/contracts/src/index.ts') },
    ],
  },
  test: {
    name: 'api',
    include: ['src/**/*.use-case.spec.ts'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
