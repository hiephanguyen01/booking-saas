import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

describe('React Router 8 compatibility', () => {
  it('does not use removed or unsafe route APIs', () => {
    const appRoot = join(process.cwd(), 'app');
    const violations = sourceFiles(appRoot)
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return (
          /from\s+['"]react-router-dom['"]/.test(source) ||
          /meta\s*\(\s*\{\s*data(?:\s*:|\s*[,}])/.test(source) ||
          /redirect\(request\.url/.test(source)
        );
      })
      .map((path) => path.slice(process.cwd().length + 1));

    expect(violations).toEqual([]);
  });
});
