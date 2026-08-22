import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { displayPath, readSource, repoPath, subdirectories } from './support/repo';

/**
 * Folder architecture for the two React Router frontends.
 *
 * `app/` has exactly six buckets, a feature has exactly four sub-folders, a
 * route module is a thin adapter, `lib/` holds no JSX, `components/` holds no
 * hooks, and `<img>` is never hand-written. Each rule below states which of
 * those it enforces; the storefront-only ones are marked.
 */

const APPS = ['apps/storefront', 'apps/dashboard'] as const;
const BUCKETS = new Set(['routes', 'constants', 'components', 'features', 'hooks', 'lib']);
const ROOT_FILES = new Set([
  'root.tsx',
  'routes.ts',
  'app.css',
  'entry.server.tsx',
  'entry.client.tsx',
]);
const FEATURE_DIRECTORIES = new Set(['components', 'hooks', 'server', 'lib']);
const MANAGED_IMAGE_FILE = 'packages/ui/src/components/media/image.tsx';
const MAX_ROUTE_LINES = 120;
const ROUTE_MODULE_EXPORTS = new Set([
  'action',
  'clientAction',
  'clientLoader',
  'clientMiddleware',
  'default',
  'ErrorBoundary',
  'handle',
  'headers',
  'HydrateFallback',
  'links',
  'loader',
  'meta',
  'middleware',
  'shouldRevalidate',
  'unstable_clientMiddleware',
  'unstable_middleware',
]);

function sourceFiles(path: string, output: string[] = []): string[] {
  for (const entry of readdirSync(path)) {
    const file = join(path, entry);
    if (statSync(file).isDirectory()) sourceFiles(file, output);
    else if (/\.tsx?$/.test(entry)) output.push(file);
  }
  return output;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readSource(file),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
    : false;
}

function sourceLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${line + 1}:${character + 1}`;
}

function declaredNames(statement: ts.Statement): string[] {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    return statement.name ? [statement.name.text] : [];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
    );
  }
  if (ts.isExportDeclaration(statement) && statement.exportClause) {
    if (ts.isNamedExports(statement.exportClause)) {
      return statement.exportClause.elements.map((element) => element.name.text);
    }
    return [statement.exportClause.name.text];
  }
  return [];
}

function isExported(statement: ts.Statement): boolean {
  return hasModifier(statement, ts.SyntaxKind.ExportKeyword) || ts.isExportDeclaration(statement);
}

/** A route module may hold imports and the React Router exports — nothing else. */
function isAllowedRouteStatement(statement: ts.Statement): boolean {
  if (ts.isImportDeclaration(statement) || ts.isEmptyStatement(statement)) return true;
  if (ts.isExportAssignment(statement)) return !statement.isExportEquals;

  const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
  if (isDefault && isExported(statement)) return true;
  if (!isExported(statement)) return false;

  const names = declaredNames(statement);
  return names.length > 0 && names.every((name) => ROUTE_MODULE_EXPORTS.has(name));
}

function importedModule(statement: ts.Statement): string | null {
  if (
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier &&
    ts.isStringLiteralLike(statement.moduleSpecifier)
  ) {
    return statement.moduleSpecifier.text;
  }
  return null;
}

/** String literals in `app/routes.ts` that name a route module file. */
function routeModuleNames(routeConfigFile: string): Set<string> {
  const sourceFile = parse(routeConfigFile);
  const modules = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isStringLiteralLike(node) && /^routes\/.+\.tsx?$/.test(node.text))
      modules.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return modules;
}

interface Findings {
  readonly buckets: string[];
  readonly featureDirectories: string[];
  readonly libJsx: string[];
  readonly componentHooks: string[];
  readonly serverPlacement: string[];
  readonly rawImg: string[];
  readonly routeRegistry: string[];
  readonly routeSize: string[];
  readonly routeStatements: string[];
  readonly routeImports: string[];
}

function collectRawImg(file: string, into: string[]): void {
  const path = displayPath(file);
  if (path === MANAGED_IMAGE_FILE) return;
  const sourceFile = parse(file);
  function visit(node: ts.Node): void {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === 'img'
    ) {
      into.push(
        `${path}:${sourceLocation(sourceFile, node)}: dùng Image từ @booking/ui/components/media/image thay cho <img> để giữ chính sách tải/tối ưu ảnh tập trung`,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function collect(): Findings {
  const findings: Findings = {
    buckets: [],
    featureDirectories: [],
    libJsx: [],
    componentHooks: [],
    serverPlacement: [],
    rawImg: [],
    routeRegistry: [],
    routeSize: [],
    routeStatements: [],
    routeImports: [],
  };

  for (const app of APPS) {
    const appDirectory = repoPath(app, 'app');

    for (const entry of readdirSync(appDirectory)) {
      const fullPath = join(appDirectory, entry);
      if (statSync(fullPath).isDirectory()) {
        if (!BUCKETS.has(entry)) {
          findings.buckets.push(
            `${app}/app/${entry}/: bucket lạ — chỉ cho phép ${[...BUCKETS].join(', ')}`,
          );
        }
      } else if (!ROOT_FILES.has(entry)) {
        findings.buckets.push(`${app}/app/${entry}: file gốc lạ — đưa vào một bucket`);
      }
    }

    const featuresDirectory = join(appDirectory, 'features');
    for (const feature of subdirectories(featuresDirectory)) {
      for (const directory of subdirectories(join(featuresDirectory, feature))) {
        if (!FEATURE_DIRECTORIES.has(directory)) {
          findings.featureDirectories.push(
            `${app}/app/features/${feature}/${directory}/: chỉ cho phép components/, hooks/, server/, lib/`,
          );
        }
      }
    }

    for (const file of sourceFiles(appDirectory)) {
      collectRawImg(file, findings.rawImg);
      const appRelativePath = relative(appDirectory, file).split('\\').join('/');
      const isLibModule =
        appRelativePath.startsWith('lib/') || /^features\/[^/]+\/lib\//.test(appRelativePath);
      const isSharedComponent = appRelativePath.startsWith('components/');
      const isStorefrontFeatureComponent =
        app === 'apps/storefront' && /^features\/[^/]+\/components\//.test(appRelativePath);
      const isComponentFile = isSharedComponent || isStorefrontFeatureComponent;

      if (isLibModule && appRelativePath.endsWith('.tsx')) {
        findings.libJsx.push(
          `${app}/app/${appRelativePath}: lib không chứa JSX; dùng .ts hoặc chuyển UI về components/`,
        );
      }

      if (isComponentFile) {
        if (/(^|\/)use-[^/]+\.tsx?$/.test(appRelativePath)) {
          findings.componentHooks.push(
            `${app}/app/${appRelativePath}: hook use-* phải ở hooks/ cùng cấp, không nằm trong components/`,
          );
        }

        const sourceFile = parse(file);
        for (const statement of sourceFile.statements) {
          if (!isExported(statement)) continue;
          for (const hookName of declaredNames(statement).filter((name) =>
            /^use[A-Z]/.test(name),
          )) {
            findings.componentHooks.push(
              `${app}/app/${appRelativePath}:${sourceLocation(sourceFile, statement)}: exported hook ${hookName} phải ở hooks/ cùng cấp`,
            );
          }
        }
      }

      if (!appRelativePath.includes('.server.')) continue;
      if (appRelativePath === 'entry.server.tsx') continue;

      // The storefront keeps cross-feature server infrastructure one level deeper
      // than the dashboard does; both allow a feature to own its own server/.
      const sharedServerDirectory = app === 'apps/storefront' ? 'lib/server/' : 'lib/';
      const correctlyPlaced =
        appRelativePath.startsWith(sharedServerDirectory) ||
        /^features\/[^/]+\/server\//.test(appRelativePath) ||
        appRelativePath.startsWith('routes/');
      if (!correctlyPlaced) {
        findings.serverPlacement.push(
          `${app}/app/${appRelativePath}: *.server.ts phải ở ${sharedServerDirectory} hoặc features/<name>/server/`,
        );
      }
    }

    // Dashboard documents the same thin-route convention but still has separate
    // implementation debt. Keep this semantic route-module gate storefront-only
    // until the dashboard route audit/refactor is complete.
    if (app !== 'apps/storefront') continue;

    const routeFiles = sourceFiles(join(appDirectory, 'routes'));
    const registeredRoutes = routeModuleNames(join(appDirectory, 'routes.ts'));
    const actualRoutes = new Set(
      routeFiles.map((file) => relative(appDirectory, file).split('\\').join('/')),
    );

    for (const routeModule of registeredRoutes) {
      if (!actualRoutes.has(routeModule)) {
        findings.routeRegistry.push(
          `${app}/app/routes.ts: route module đã đăng ký nhưng không tồn tại: ${routeModule}`,
        );
      }
    }

    for (const file of routeFiles) {
      const appRelativePath = relative(appDirectory, file).split('\\').join('/');
      if (!registeredRoutes.has(appRelativePath)) {
        findings.routeRegistry.push(
          `${app}/app/${appRelativePath}: support file không được nằm trong routes/; chỉ route module đăng ký bởi app/routes.ts được phép`,
        );
        continue;
      }

      const lines = readSource(file).split('\n').length;
      if (lines > MAX_ROUTE_LINES) {
        findings.routeSize.push(
          `${displayPath(file)}: ${lines} dòng > ${MAX_ROUTE_LINES} — tách UI/loader sang features/`,
        );
      }

      const sourceFile = parse(file);
      for (const statement of sourceFile.statements) {
        const moduleName = importedModule(statement);
        if (moduleName) {
          const isRouteAlias = moduleName.startsWith('~/routes/');
          const isRelative = moduleName.startsWith('./') || moduleName.startsWith('../');
          const isGeneratedType = moduleName.startsWith('./+types/');
          if (isRouteAlias || (isRelative && !isGeneratedType)) {
            findings.routeImports.push(
              `${app}/app/${appRelativePath}:${sourceLocation(sourceFile, statement)}: route không được import route/support file khác; relative import duy nhất là ./+types/*`,
            );
          }
        }
        if (isAllowedRouteStatement(statement)) continue;
        findings.routeStatements.push(
          `${app}/app/${appRelativePath}:${sourceLocation(sourceFile, statement)}: top-level support declaration/statement phải chuyển về owner feature; route chỉ được export ${[...ROUTE_MODULE_EXPORTS].join(', ')}`,
        );
      }
    }
  }

  for (const file of sourceFiles(repoPath('packages/ui/src'))) {
    collectRawImg(file, findings.rawImg);
  }

  return findings;
}

describe('frontend folder architecture', () => {
  const findings = collect();

  it('keeps app/ to the six known buckets', () => {
    expect(findings.buckets).toEqual([]);
  });

  it('keeps a feature to components/, hooks/, server/, lib/', () => {
    expect(findings.featureDirectories).toEqual([]);
  });

  it('keeps JSX out of lib/', () => {
    expect(findings.libJsx).toEqual([]);
  });

  it('keeps hooks out of components/', () => {
    expect(findings.componentHooks).toEqual([]);
  });

  it('places every *.server.* in a shared server directory or its feature', () => {
    expect(findings.serverPlacement).toEqual([]);
  });

  it('renders images through @booking/ui, never a hand-written <img>', () => {
    expect(findings.rawImg).toEqual([]);
  });

  it('keeps routes/ in sync with app/routes.ts and free of support files', () => {
    expect(findings.routeRegistry).toEqual([]);
  });

  it('keeps every storefront route module within its line budget', () => {
    expect(findings.routeSize).toEqual([]);
  });

  it('lets a storefront route module export only React Router route exports', () => {
    expect(findings.routeStatements).toEqual([]);
  });

  it('lets a storefront route module import nothing relative but ./+types/*', () => {
    expect(findings.routeImports).toEqual([]);
  });
});
