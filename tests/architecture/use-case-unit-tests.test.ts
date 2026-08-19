import { describe, expect, it } from 'vitest';
import { displayPath, exists, readSource, repoPath, walk } from './support/repo';

/**
 * One use case, one unit test (ADR 0009).
 *
 * A use case is the layer where a business rule actually lives, and it depends
 * only on ports — so it can be constructed with fakes and asserted without a
 * database, a Nest container or a running app. That makes it the one place in
 * this repository where a unit test is worth its maintenance.
 *
 * The rule is enforced through a backfill list rather than a git diff, because a
 * diff-based guard is only as reliable as the checkout depth CI happens to use.
 * The mechanism is simple and total: a use-case file needs a sibling spec unless
 * it is named in `use-case-backfill.txt`, and nothing may be added to that file.
 * A NEW use case therefore cannot merge without its test. When you change one of
 * the listed use cases, write its test and delete its line — that is what "backfill
 * as you go" means here, and {@link BACKFILL_CEILING} is what keeps it one-way.
 */

const USE_CASE_ROOT = repoPath('apps/api/src');
const BACKFILL_FILE = 'tests/architecture/use-case-backfill.txt';

/**
 * The number of use cases still without a test. Lower it when you backfill one;
 * never raise it. A new use case is not backfill — it is required to ship a test.
 */
const BACKFILL_CEILING = 244;

function readBackfill(): string[] {
  return readSource(repoPath(BACKFILL_FILE))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

const backfill = readBackfill();
const backfillSet = new Set(backfill);

const apiFiles = walk(USE_CASE_ROOT).map(displayPath);
const useCases = apiFiles.filter((path) => path.endsWith('.use-case.ts')).sort();
const specs = apiFiles.filter((path) => path.endsWith('.use-case.spec.ts')).sort();

const specFor = (useCase: string): string =>
  useCase.replace(/\.use-case\.ts$/, '.use-case.spec.ts');

describe('use-case unit tests (ADR 0009)', () => {
  it('finds the use cases', () => {
    expect(useCases.length).toBeGreaterThan(0);
  });

  it('gives every use case a sibling spec, or a backfill entry', () => {
    expect(
      useCases
        .filter((useCase) => !exists(repoPath(specFor(useCase))) && !backfillSet.has(useCase))
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

  it('lists no use case that has since been deleted', () => {
    const known = new Set(useCases);
    expect(
      backfill
        .filter((entry) => !known.has(entry))
        .map((entry) => `${BACKFILL_FILE}: ${entry} no longer exists — delete the line`),
    ).toEqual([]);
  });

  it('lists no use case that already has a test', () => {
    expect(
      backfill
        .filter((entry) => exists(repoPath(specFor(entry))))
        .map((entry) => `${BACKFILL_FILE}: ${entry} now has a test — delete the line`),
    ).toEqual([]);
  });

  it('never grows the backfill list', () => {
    expect(backfill.length).toBeLessThanOrEqual(BACKFILL_CEILING);
  });
});
