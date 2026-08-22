import { defineConfig } from 'vitest/config';

/**
 * Two projects, one command.
 *
 * `architecture` holds the repository-wide static guards that used to live in
 * `scripts/architecture/*.mjs` and `apps/api/scripts/check-rls.ts`. They read
 * files and assert; they never open a database, a browser or a server.
 *
 * `api` holds the use-case unit tests. It lives in `apps/api/vitest.config.ts`
 * because it needs that workspace's SWC transform to evaluate NestJS decorators.
 *
 * ADR 0009 is the policy these two projects are the whole of: anything outside
 * them is still forbidden, and `tests/architecture/test-policy.test.ts` enforces it.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'architecture',
          include: ['tests/architecture/**/*.test.ts'],
          environment: 'node',
        },
      },
      './apps/api/vitest.config.ts',
    ],
  },
});
