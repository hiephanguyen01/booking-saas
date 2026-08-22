import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayPath, readSource, repoPath, walk } from './support/repo';

/**
 * Module-cycle guard (ADR 0003).
 *
 * ADR 0003 adopted the outbox so bounded contexts would not "couple them, create
 * circular dependencies, and make a state change + its side effects non-atomic".
 * The circular-dependency half of that was never enforced, and by 2026-07-27 two
 * cycles had formed (`catalog → listing → catalog` and
 * `catalog → scheduling → listing → catalog`) because catalog reached into
 * listing's pricing helpers while listing read catalog's listing-type port. They
 * were harmless only by luck — the back-edges were pure functions, so no Nest DI
 * cycle existed and nothing needed `forwardRef`.
 *
 * Static analysis only — no TypeScript program, no database.
 */

const MODULES = repoPath('apps/api/src/modules');

interface ModuleGraph {
  /** module name → the modules it imports from. */
  readonly graph: ReadonlyMap<string, ReadonlySet<string>>;
  /** `${from}>${to}` → one concrete import that creates the edge. */
  readonly example: ReadonlyMap<string, string>;
}

function buildGraph(): ModuleGraph {
  const graph = new Map<string, Set<string>>();
  const example = new Map<string, string>();
  for (const file of walk(MODULES).filter((candidate) => candidate.endsWith('.ts'))) {
    const source = relative(MODULES, file).split(sep)[0];
    if (!source) continue;
    for (const match of readSource(file).matchAll(/from\s+'(\.[^']*)'/g)) {
      const target = resolve(dirname(file), match[1] as string);
      if (!target.startsWith(MODULES + sep)) continue;
      const targetModule = relative(MODULES, target).split(sep)[0];
      if (!targetModule || targetModule === source) continue;
      const edges = graph.get(source) ?? new Set<string>();
      edges.add(targetModule);
      graph.set(source, edges);
      const key = `${source}>${targetModule}`;
      if (!example.has(key)) example.set(key, `${displayPath(file)} → ${targetModule}`);
    }
  }
  return { graph, example };
}

/** Depth-first search; a node already on the current path closes a cycle. */
function findCycles({ graph, example }: ModuleGraph): string[] {
  const cycles = new Set<string>();
  const done = new Set<string>();

  function visit(node: string, path: string[]): void {
    for (const next of graph.get(node) ?? []) {
      const at = path.indexOf(next);
      if (at !== -1) {
        const loop = path.slice(at);
        // Rotate to a stable starting point so one cycle is reported once.
        const start = loop.indexOf([...loop].sort()[0] as string);
        cycles.add([...loop.slice(start), ...loop.slice(0, start), loop[start]].join(' → '));
        continue;
      }
      if (done.has(next)) continue;
      visit(next, [...path, next]);
    }
    done.add(node);
  }

  for (const node of graph.keys()) visit(node, [node]);

  // Report each cycle with the import that creates every hop: the fix is always
  // "move this specific shared thing", never "break the cycle" in the abstract.
  return [...cycles].sort().map((cycle) => {
    const hops = cycle.split(' → ');
    const edges = hops
      .slice(0, -1)
      .map((from, index) => `      via ${example.get(`${from}>${hops[index + 1]}`) ?? '?'}`);
    return [cycle, ...edges].join('\n');
  });
}

describe('bounded-context import graph (ADR 0003)', () => {
  const moduleGraph = buildGraph();

  it('reads a non-empty module graph', () => {
    // Count directories, not graph nodes: a module with no cross-module import at
    // all is still a module, and reporting only the connected ones understates
    // coverage. A zero here means the walker broke, not that the repo is clean.
    const moduleCount = readdirSync(MODULES).filter((entry) =>
      statSync(join(MODULES, entry)).isDirectory(),
    ).length;
    expect(moduleCount).toBeGreaterThan(0);
    expect(moduleGraph.graph.size).toBeGreaterThan(0);
  });

  it('is acyclic — fix by moving shared logic to shared/domain, never with forwardRef()', () => {
    expect(findCycles(moduleGraph)).toEqual([]);
  });
});
