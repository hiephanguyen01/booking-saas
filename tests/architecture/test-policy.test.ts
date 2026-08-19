import { describe, expect, it } from 'vitest';
import { displayPath, exists, readSource, repoPath, walk } from './support/repo';

/**
 * The tests policy itself (ADR 0009, which relaxes ADR 0005).
 *
 * Two kinds of test exist in this repository and no others:
 *   1. a use-case unit test, `apps/api/src/**\/*.use-case.spec.ts`, beside the
 *      use-case it covers;
 *   2. an architecture guard, `tests/architecture/**\/*.test.ts`, which reads
 *      files and asserts.
 *
 * Everything else stays forbidden — no integration or e2e suites, no browser
 * driver, no component tests in either frontend, no second runner. The reason is
 * unchanged from ADR 0005: this repo verifies behaviour by running the real
 * applications against real infrastructure, and a broad mocked suite would buy
 * confidence it has not earned. What ADR 0009 adds is that a use case is a pure
 * function of its ports, so a unit test there is cheap and does not lie.
 */

const ALLOWED_TEST_FILE = [
  /^tests\/architecture\/[^/]+\.test\.ts$/,
  /^apps\/api\/src\/.+\.use-case\.spec\.ts$/,
] as const;

/** Test-shaped artifacts, wherever they appear. */
const TEST_FILE = /(?:^|\/)(?:__tests__)(?:\/|$)|\.(?:test|spec|e2e|e2e-spec)\.[cm]?[jt]sx?$/;

const FORBIDDEN_RUNNER_PACKAGES = new Set([
  '@playwright/test',
  'ava',
  'cypress',
  'jest',
  'mocha',
  'playwright',
  'tap',
]);
const FORBIDDEN_RUNNER_COMMAND =
  /(?:^|\s)(?:node\s+--test|jest|playwright|cypress|mocha|ava|tap)(?:\s|$)/;

/** Vitest is the one runner, and it is wired up in exactly these two manifests. */
const VITEST_MANIFESTS = new Set(['package.json', 'apps/api/package.json']);
/** Only the workspace root drives the suite; no package runs tests on its own. */
const TEST_SCRIPT_MANIFEST = 'package.json';

interface Manifest {
  readonly path: string;
  readonly scripts: Record<string, string>;
  readonly dependencies: Record<string, Record<string, string>>;
}

const files = walk(repoPath()).map(displayPath);

const manifests: Manifest[] = files
  .filter((path) => path === 'package.json' || path.endsWith('/package.json'))
  .map((path) => {
    const parsed = JSON.parse(readSource(repoPath(path))) as Record<string, unknown>;
    return {
      path,
      scripts: (parsed.scripts ?? {}) as Record<string, string>,
      dependencies: Object.fromEntries(
        ['dependencies', 'devDependencies', 'optionalDependencies'].map((section) => [
          section,
          (parsed[section] ?? {}) as Record<string, string>,
        ]),
      ),
    };
  });

describe('tests policy (ADR 0009)', () => {
  it('reads the workspace manifests', () => {
    expect(manifests.map((manifest) => manifest.path)).toContain('package.json');
  });

  it('places every test file in one of the two sanctioned locations', () => {
    expect(
      files
        .filter((path) => TEST_FILE.test(path))
        .filter((path) => !ALLOWED_TEST_FILE.some((allowed) => allowed.test(path)))
        .map(
          (path) =>
            `${path}: only apps/api/src/**/*.use-case.spec.ts and tests/architecture/*.test.ts are allowed (ADR 0009)`,
        ),
    ).toEqual([]);
  });

  it('keeps both vitest projects wired up', () => {
    expect(exists(repoPath('vitest.config.ts'))).toBe(true);
    expect(exists(repoPath('apps/api/vitest.config.ts'))).toBe(true);
  });

  it('declares no test runner other than vitest', () => {
    const failures: string[] = [];
    for (const manifest of manifests) {
      for (const [section, entries] of Object.entries(manifest.dependencies)) {
        for (const dependency of Object.keys(entries)) {
          if (FORBIDDEN_RUNNER_PACKAGES.has(dependency)) {
            failures.push(
              `${manifest.path}: forbidden test-runner dependency "${dependency}" in ${section}`,
            );
          }
          if (dependency === 'vitest' && !VITEST_MANIFESTS.has(manifest.path)) {
            failures.push(
              `${manifest.path}: vitest belongs to the workspace root and @booking/api only`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('drives the suite from the workspace root alone', () => {
    const failures: string[] = [];
    for (const manifest of manifests) {
      for (const [name, command] of Object.entries(manifest.scripts)) {
        if (
          (name === 'test' || name.startsWith('test:')) &&
          manifest.path !== TEST_SCRIPT_MANIFEST
        ) {
          failures.push(`${manifest.path}: test script "${name}" belongs to the workspace root`);
        }
        if (FORBIDDEN_RUNNER_COMMAND.test(command)) {
          failures.push(`${manifest.path}: script "${name}" invokes a forbidden test runner`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('leaves no package script pointing at a deleted root script', () => {
    // Not strictly a tests-policy rule, but this is the manifest guard and this is
    // exactly how the old `check:*` scripts rotted: the storefront's `security`
    // script outlived `check:storefront-security` by one careless revert, and
    // nothing failed until someone ran it.
    const rootScripts = new Set(
      Object.keys(manifests.find((manifest) => manifest.path === 'package.json')?.scripts ?? {}),
    );
    const failures: string[] = [];
    for (const manifest of manifests) {
      if (manifest.path === 'package.json') continue;
      for (const [name, command] of Object.entries(manifest.scripts)) {
        for (const match of command.matchAll(
          /pnpm\s+(?:--workspace-root|-w)\s+(?:run\s+)?([\w:.-]+)/g,
        )) {
          const target = match[1] as string;
          if (!rootScripts.has(target)) {
            failures.push(
              `${manifest.path}: script "${name}" runs root script "${target}", which does not exist`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('runs no forbidden runner in CI', () => {
    expect(
      files
        .filter((path) => path.startsWith('.github/workflows/') && /\.ya?ml$/.test(path))
        .filter((path) => FORBIDDEN_RUNNER_COMMAND.test(readSource(repoPath(path))))
        .map((path) => `${path}: CI step invokes a forbidden test runner (ADR 0009)`),
    ).toEqual([]);
  });
});
