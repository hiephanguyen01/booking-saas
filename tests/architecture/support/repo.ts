import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Filesystem helpers shared by the architecture guards.
 *
 * Every path a guard reports is repo-relative and POSIX-separated, so a failure
 * message is the same string on macOS, Linux and Windows and can be pasted
 * straight into an editor.
 */

export const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

export function repoPath(...segments: string[]): string {
  return join(repoRoot, ...segments);
}

export function displayPath(absolutePath: string): string {
  return relative(repoRoot, absolutePath).split(sep).join('/');
}

/** Build output, VCS metadata and dependencies are never part of a guard's input. */
export const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.react-router',
  '.turbo',
  '.worktrees',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'test-results',
]);

export interface WalkOptions {
  /** Directory names to skip, in addition to {@link IGNORED_DIRECTORIES}. */
  readonly ignore?: ReadonlySet<string>;
  /** Skip every entry whose name starts with a dot. */
  readonly skipDotEntries?: boolean;
}

/** Every file under `directory`, recursively, in `readdir` order. */
export function walk(directory: string, options: WalkOptions = {}): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (IGNORED_DIRECTORIES.has(entry)) continue;
    if (options.ignore?.has(entry)) continue;
    if (options.skipDotEntries && entry.startsWith('.')) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path, options));
    else files.push(path);
  }
  return files;
}

/** Files under `directory` whose extension is in `extensions` (with the dot). */
export function filesWithExtension(
  directory: string,
  extensions: ReadonlySet<string>,
  options: WalkOptions = {},
): string[] {
  return walk(directory, options).filter((file) => {
    const dot = file.lastIndexOf('.');
    return dot !== -1 && extensions.has(file.slice(dot));
  });
}

export function subdirectories(path: string): string[] {
  return readdirSync(path).filter((entry) => statSync(join(path, entry)).isDirectory());
}

export function readSource(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8');
}

export function exists(absolutePath: string): boolean {
  try {
    statSync(absolutePath);
    return true;
  } catch {
    return false;
  }
}

/** One repo-relative path plus its contents — what most guards iterate over. */
export interface SourceFile {
  readonly path: string;
  readonly source: string;
}

export function loadSources(
  directory: string,
  extensions: ReadonlySet<string>,
  options: WalkOptions = {},
): SourceFile[] {
  return filesWithExtension(directory, extensions, options).map((file) => ({
    path: displayPath(file),
    source: readSource(file),
  }));
}

/**
 * Allowlist entries name a file. When that file is deleted or moved the entry
 * stops describing anything and silently widens the guard, so every guard that
 * carries an allowlist asserts this.
 */
export function staleAllowlistEntries(allowlist: ReadonlyMap<string, string>): string[] {
  return [...allowlist]
    .filter(([path]) => !exists(repoPath(path)))
    .map(([path, reason]) => `${path}: allowlisted as "${reason}" but the file no longer exists`);
}
