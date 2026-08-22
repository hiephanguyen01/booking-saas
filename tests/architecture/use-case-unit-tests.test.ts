import { describe, expect, it } from 'vitest';
import { displayPath, exists, repoPath, walk } from './support/repo';

/**
 * One use case, one unit test (ADR 0009).
 *
 * A use case is the layer where a business rule actually lives, and it depends
 * only on ports — so it can be constructed with fakes and asserted without a
 * database, a Nest container or a running app. That makes it the one place in
 * this repository where a unit test is worth its maintenance.
 *
 * The rule is enforced by walking the tree rather than the git diff, because a
 * diff-based guard is only as reliable as the checkout depth CI happens to use.
 * The mechanism is total: every `*.use-case.ts` has a sibling `*.use-case.spec.ts`,
 * with no allowlist and no exemption. The backfill list this guard shipped with
 * reached zero on 2026-08-20 and was deleted with it — there is no longer any
 * way to add a use case without its test.
 */

const USE_CASE_ROOT = repoPath('apps/api/src');

const apiFiles = walk(USE_CASE_ROOT).map(displayPath);
const useCases = apiFiles.filter((path) => path.endsWith('.use-case.ts')).sort();
const specs = apiFiles.filter((path) => path.endsWith('.use-case.spec.ts')).sort();

const specFor = (useCase: string): string =>
  useCase.replace(/\.use-case\.ts$/, '.use-case.spec.ts');

describe('use-case unit tests (ADR 0009)', () => {
  it('finds the use cases', () => {
    expect(useCases.length).toBeGreaterThan(0);
  });

  it('gives EVERY use case a sibling spec', () => {
    expect(
      useCases
        .filter((useCase) => !exists(repoPath(specFor(useCase))))
        .map(
          (useCase) =>
            `${useCase}: missing ${specFor(useCase)} — one use case, one unit test (ADR 0009)`,
        ),
    ).toEqual([]);
  });

  it('keeps every spec beside the use case it covers', () => {
    expect(
      specs
        .filter((spec) => !exists(repoPath(spec.replace(/\.spec\.ts$/, '.ts'))))
        .map((spec) => `${spec}: covers no use case — did the use case move or get renamed?`),
    ).toEqual([]);
  });
});
