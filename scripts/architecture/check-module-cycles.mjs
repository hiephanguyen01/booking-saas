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
 * This script keeps the `apps/api/src/modules/*` import graph a DAG. Pure logic
 * shared by two contexts belongs in `shared/domain/*`, not inside whichever
 * module happened to write it first.
 *
 * Static analysis only — no TypeScript program, no database.
 * Run: `pnpm check:module-cycles`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

const MODULES = resolve(process.cwd(), 'apps/api/src/modules');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** module name → Set of modules it imports from, with one example edge each. */
function buildGraph() {
  const graph = new Map();
  const example = new Map();
  for (const file of walk(MODULES)) {
    const source = relative(MODULES, file).split(sep)[0];
    for (const match of readFileSync(file, 'utf8').matchAll(/from\s+'(\.[^']*)'/g)) {
      const target = resolve(dirname(file), match[1]);
      if (!target.startsWith(MODULES + sep)) continue;
      const targetModule = relative(MODULES, target).split(sep)[0];
      if (targetModule === source) continue;
      if (!graph.has(source)) graph.set(source, new Set());
      graph.get(source).add(targetModule);
      const key = `${source}>${targetModule}`;
      if (!example.has(key)) {
        example.set(key, `${relative(process.cwd(), file)} → ${targetModule}`);
      }
    }
  }
  return { graph, example };
}

const { graph, example } = buildGraph();

// Depth-first search; a node already on the current path closes a cycle.
const cycles = new Set();
const done = new Set();
function visit(node, path) {
  for (const next of graph.get(node) ?? []) {
    const at = path.indexOf(next);
    if (at !== -1) {
      const loop = path.slice(at);
      // Rotate to a stable starting point so one cycle is reported once.
      const start = loop.indexOf([...loop].sort()[0]);
      cycles.add([...loop.slice(start), ...loop.slice(0, start), loop[start]].join(' → '));
      continue;
    }
    if (done.has(next)) continue;
    visit(next, [...path, next]);
  }
  done.add(node);
}
for (const node of graph.keys()) visit(node, [node]);

if (cycles.size > 0) {
  console.error(
    [
      `Module cycle check failed — ${cycles.size} circular dependency(ies) between bounded contexts (ADR 0003):`,
      ...[...cycles].sort().flatMap((cycle) => {
        const hops = cycle.split(' → ');
        const edges = hops
          .slice(0, -1)
          .map((from, i) => `      via ${example.get(`${from}>${hops[i + 1]}`) ?? '?'}`);
        return [`  - ${cycle}`, ...edges];
      }),
      '',
      'Fix by moving the logic both contexts share into apps/api/src/shared/domain/,',
      'or by inverting the dependency behind a port. Do not add forwardRef().',
    ].join('\n'),
  );
  process.exit(1);
}

// Count directories, not graph nodes: a module with no cross-module import at all
// is still a module, and reporting only the connected ones understates coverage.
const moduleCount = readdirSync(MODULES).filter((entry) =>
  statSync(join(MODULES, entry)).isDirectory(),
).length;
console.log(`Module cycle check passed — ${moduleCount} modules, import graph is acyclic.`);
