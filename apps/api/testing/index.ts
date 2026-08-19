/**
 * Fakes shared by the use-case unit tests (ADR 0009).
 *
 * Lives outside `src/` on purpose: `tsconfig.build.json` compiles `src` only, so
 * nothing here can reach a production bundle. Import it as `~testing`.
 */
export { fakePort } from './fake-port';
export { fakeTenantDb, type FakeTenantDb } from './tenant-db';
