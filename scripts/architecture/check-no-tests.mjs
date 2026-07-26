import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const failures = [];
const ignoredDirectories = new Set([
  '.git',
  '.react-router',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'test-results',
]);
const forbiddenRunnerPackages = new Set([
  '@playwright/test',
  'ava',
  'cypress',
  'jest',
  'mocha',
  'playwright',
  'tap',
  'vitest',
]);
const forbiddenRunnerCommand = /(?:^|\s)(?:node\s+--test|jest|vitest|playwright|cypress|mocha|ava|tap)(?:\s|$)/;

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function displayPath(path) {
  return relative(root, path).split(sep).join('/');
}

const files = walk(root);
const forbiddenTestFile = /(?:^|\/)(?:__tests__)(?:\/|$)|\.(?:test|spec|e2e|e2e-spec)\.[cm]?[jt]sx?$/;

for (const file of files) {
  const path = displayPath(file);
  if (forbiddenTestFile.test(path)) {
    failures.push(`${path}: automated test artifact is forbidden by ADR 0005`);
  }
}

for (const file of files.filter((candidate) => candidate.endsWith(`${sep}package.json`))) {
  const path = displayPath(file);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    failures.push(`${path}: invalid package.json`);
    continue;
  }

  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    if (name === 'test' || name.startsWith('test:')) {
      failures.push(`${path}: forbidden package script "${name}"`);
    }
    if (typeof command === 'string' && forbiddenRunnerCommand.test(command)) {
      failures.push(`${path}: script "${name}" invokes an automated test runner`);
    }
  }

  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (forbiddenRunnerPackages.has(dependency)) {
        failures.push(`${path}: forbidden test-runner dependency "${dependency}" in ${section}`);
      }
    }
  }
}

const workflowRoot = join(root, '.github', 'workflows');
for (const file of files.filter((candidate) => candidate.startsWith(`${workflowRoot}${sep}`))) {
  if (!/\.ya?ml$/.test(file)) continue;
  const path = displayPath(file);
  const source = readFileSync(file, 'utf8');
  if (forbiddenRunnerCommand.test(source) || /\b(?:pnpm|npm|yarn)\b[^\n]*\btest(?::\S+)?\b/.test(source)) {
    failures.push(`${path}: CI automated-test step is forbidden by ADR 0005`);
  }
}

if (failures.length > 0) {
  console.error(['No-tests policy check failed:', ...failures.map((item) => `- ${item}`)].join('\n'));
  process.exit(1);
}

console.log('No-tests policy check passed.');
