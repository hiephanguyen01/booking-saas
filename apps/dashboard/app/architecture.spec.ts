import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import routeConfig from './routes';

/**
 * Architecture guard-rails — every convention from the folder-structure
 * refactor is enforced here so it cannot silently regress:
 *
 *   1. `routes/**` holds ONLY registered route modules (+ each area's
 *      `routes.ts` / `nav.ts` config files).
 *   2. No route module imports another area's route tree.
 *   3. `features/**` and `components/**` never import route internals
 *      (`~/routes/...`) or a route's generated types (`./+types/...`).
 *   4. Browser-reachable modules never VALUE-import a `*.server` module
 *      (type-only imports are fine — they are erased at build time).
 *   5. `constants/**` stays leaf-level: it may import only @booking/contracts.
 *
 * Plus the React Router 8 compatibility checks this file previously carried.
 */

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const APP_ROOT = join(process.cwd(), 'app');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

/** Path relative to the app dir, e.g. `routes/tenant/settings.tsx`. */
function appPath(path: string): string {
  return path.slice(APP_ROOT.length + 1);
}

/** Every import specifier in a source file (static imports/re-exports). */
function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:import|export)[^;'"]*?from\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1]!,
  );
}

interface RouteEntry {
  file: string;
  children?: RouteEntry[];
}

function registeredRouteFiles(entries: RouteEntry[]): string[] {
  return entries.flatMap((entry) => [
    entry.file,
    ...(entry.children ? registeredRouteFiles(entry.children) : []),
  ]);
}

describe('Dashboard architecture', () => {
  it('routes/ contains only registered route modules plus per-area routes.ts and nav.ts', () => {
    const registered = new Set(registeredRouteFiles(routeConfig as RouteEntry[]));
    const violations = sourceFiles(join(APP_ROOT, 'routes'))
      .map(appPath)
      .filter((path) => {
        if (registered.has(path)) return false;
        // Per-area config files are the sanctioned non-route residents.
        return !/^routes\/[^/]+\/(routes|nav)\.ts$/.test(path);
      });

    expect(violations).toEqual([]);
  });

  it('never imports across area route trees', () => {
    const violations: string[] = [];
    for (const path of sourceFiles(join(APP_ROOT, 'routes'))) {
      const segments = appPath(path).split('/');
      // Top-level route modules (home, auth, resource routes) have no area.
      if (segments.length < 3) continue;
      const area = segments[1]!;
      for (const spec of importSpecifiers(readFileSync(path, 'utf8'))) {
        if (spec.includes('/+types/') || spec.startsWith('./+types')) continue;
        const tildeMatch = spec.match(/^~\/routes\/([^/]+)\//);
        if (tildeMatch && tildeMatch[1] !== area) {
          violations.push(`${appPath(path)} → ${spec}`);
          continue;
        }
        if (spec.startsWith('.')) {
          const resolved = resolve(dirname(path), spec);
          const resolvedApp = resolved.startsWith(APP_ROOT) ? appPath(resolved) : null;
          const areaMatch = resolvedApp?.match(/^routes\/([^/]+)\//);
          if (areaMatch && areaMatch[1] !== area) {
            violations.push(`${appPath(path)} → ${spec}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('features/ and components/ never reach into routes/ or route-generated types', () => {
    const violations: string[] = [];
    for (const dir of ['features', 'components']) {
      for (const path of sourceFiles(join(APP_ROOT, dir))) {
        for (const spec of importSpecifiers(readFileSync(path, 'utf8'))) {
          if (spec.startsWith('~/routes/') || spec.includes('/+types/') || spec.startsWith('./+types')) {
            violations.push(`${appPath(path)} → ${spec}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps VALUE imports of *.server modules out of browser-reachable modules', () => {
    const violations: string[] = [];
    for (const dir of ['features', 'components']) {
      for (const path of sourceFiles(join(APP_ROOT, dir))) {
        if (/\.server\.(ts|tsx)$/.test(path) || /\.spec\.(ts|tsx)$/.test(path)) continue;
        const source = readFileSync(path, 'utf8');
        // `import type … from 'x.server'` is erased at build time and allowed;
        // any other import form of a .server module would ship server code.
        const valueImport = /(?:^|\n)\s*import\s+(?!type\s)[^;]*?from\s+['"][^'"]+\.server['"]/;
        if (valueImport.test(source)) violations.push(appPath(path));
      }
    }

    expect(violations).toEqual([]);
  });

  it('constants/ imports nothing but @booking/contracts', () => {
    const violations: string[] = [];
    for (const path of sourceFiles(join(APP_ROOT, 'constants'))) {
      for (const spec of importSpecifiers(readFileSync(path, 'utf8'))) {
        if (spec !== '@booking/contracts') violations.push(`${appPath(path)} → ${spec}`);
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('React Router 8 compatibility', () => {
  it('does not use removed or unsafe route APIs', () => {
    const violations = sourceFiles(APP_ROOT)
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return (
          /from\s+['"]react-router-dom['"]/.test(source) ||
          /meta\s*\(\s*\{\s*data(?:\s*:|\s*[,}])/.test(source) ||
          /redirect\(request\.url/.test(source)
        );
      })
      .map(appPath);

    expect(violations).toEqual([]);
  });
});
