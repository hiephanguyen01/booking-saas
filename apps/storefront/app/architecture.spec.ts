import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

describe('Storefront feature boundaries', () => {
  it('keeps server-only imports out of browser-reachable feature modules', () => {
    const featureRoot = join(process.cwd(), 'app', 'features');
    const violations = sourceFiles(featureRoot)
      .filter((path) => /from\s+['"][^'"]+\.server['"]/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(process.cwd().length + 1));

    expect(violations).toEqual([]);
  });
});
