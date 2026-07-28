import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const apps = ['apps/storefront', 'apps/dashboard'];
const buckets = new Set(['routes', 'constants', 'components', 'features', 'hooks', 'lib']);
const rootFiles = new Set([
  'root.tsx',
  'routes.ts',
  'app.css',
  'entry.server.tsx',
  'entry.client.tsx',
]);
const featureDirectories = new Set(['components', 'hooks', 'server', 'lib']);
const maxRouteLines = 120;
const failures = [];

function directories(path) {
  return readdirSync(path).filter((entry) => statSync(join(path, entry)).isDirectory());
}

function sourceFiles(path, output = []) {
  for (const entry of readdirSync(path)) {
    const file = join(path, entry);
    if (statSync(file).isDirectory()) {
      sourceFiles(file, output);
    } else if (/\.tsx?$/.test(entry)) {
      output.push(file);
    }
  }
  return output;
}

for (const app of apps) {
  const appDirectory = join(root, app, 'app');

  for (const entry of readdirSync(appDirectory)) {
    const fullPath = join(appDirectory, entry);
    if (statSync(fullPath).isDirectory()) {
      if (!buckets.has(entry)) {
        failures.push(`${app}/app/${entry}/: bucket lạ — chỉ cho phép ${[...buckets].join(', ')}`);
      }
    } else if (!rootFiles.has(entry)) {
      failures.push(`${app}/app/${entry}: file gốc lạ — đưa vào một bucket`);
    }
  }

  const featuresDirectory = join(appDirectory, 'features');
  for (const feature of directories(featuresDirectory)) {
    for (const directory of directories(join(featuresDirectory, feature))) {
      if (!featureDirectories.has(directory)) {
        failures.push(
          `${app}/app/features/${feature}/${directory}/: chỉ cho phép components/, hooks/, server/, lib/`,
        );
      }
    }
  }

  for (const file of sourceFiles(appDirectory)) {
    const appRelativePath = relative(appDirectory, file).split('\\').join('/');
    if (!appRelativePath.includes('.server.')) continue;
    if (appRelativePath === 'entry.server.tsx') continue;

    const correctlyPlaced =
      appRelativePath.startsWith('lib/') ||
      /^features\/[^/]+\/server\//.test(appRelativePath) ||
      appRelativePath.startsWith('routes/');
    if (!correctlyPlaced) {
      failures.push(
        `${app}/app/${appRelativePath}: *.server.ts phải ở lib/ hoặc features/<name>/server/`,
      );
    }
  }

  // Dashboard documents the same thin-route convention but still has separate
  // implementation debt. Phase 8 expands this storefront-only LOC guard into a
  // semantic route-module check before the script is connected to CI.
  if (app !== 'apps/storefront') continue;

  for (const file of sourceFiles(join(appDirectory, 'routes'))) {
    const lines = readFileSync(file, 'utf8').split('\n').length;
    if (lines > maxRouteLines) {
      failures.push(
        `${relative(root, file)}: ${lines} dòng > ${maxRouteLines} — tách UI/loader sang features/`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(
    `Frontend structure check failed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}`,
  );
  process.exit(1);
}

console.log('Frontend structure check passed.');
