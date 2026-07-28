import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

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
const routeModuleExports = new Set([
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

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function sourceLocation(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${line + 1}:${character + 1}`;
}

function routeModuleNames(routeConfigFile) {
  const source = readFileSync(routeConfigFile, 'utf8');
  const sourceFile = ts.createSourceFile(
    routeConfigFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const modules = new Set();

  function visit(node) {
    if (ts.isStringLiteralLike(node) && /^routes\/.+\.tsx?$/.test(node.text)) {
      modules.add(node.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return modules;
}

function importedModule(statement) {
  if (
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier &&
    ts.isStringLiteralLike(statement.moduleSpecifier)
  ) {
    return statement.moduleSpecifier.text;
  }
  return null;
}

function validateRouteImport(app, appRelativePath, sourceFile, statement) {
  const moduleName = importedModule(statement);
  if (!moduleName) return;

  const isRouteAlias = moduleName.startsWith('~/routes/');
  const isRelative = moduleName.startsWith('./') || moduleName.startsWith('../');
  const isGeneratedType = moduleName.startsWith('./+types/');
  if (isRouteAlias || (isRelative && !isGeneratedType)) {
    failures.push(
      `${app}/app/${appRelativePath}:${sourceLocation(sourceFile, statement)}: route không được import route/support file khác; relative import duy nhất là ./+types/*`,
    );
  }
}

function declaredNames(statement) {
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

function isAllowedRouteStatement(statement) {
  if (ts.isImportDeclaration(statement) || ts.isEmptyStatement(statement)) return true;
  if (ts.isExportAssignment(statement)) return !statement.isExportEquals;

  const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
  const isExported =
    hasModifier(statement, ts.SyntaxKind.ExportKeyword) || ts.isExportDeclaration(statement);
  if (isDefault && isExported) return true;
  if (!isExported) return false;

  const names = declaredNames(statement);
  return names.length > 0 && names.every((name) => routeModuleExports.has(name));
}

function validateRouteModule(app, appDirectory, file) {
  const source = readFileSync(file, 'utf8');
  const appRelativePath = relative(appDirectory, file).split('\\').join('/');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    validateRouteImport(app, appRelativePath, sourceFile, statement);
    if (isAllowedRouteStatement(statement)) continue;

    failures.push(
      `${app}/app/${appRelativePath}:${sourceLocation(sourceFile, statement)}: top-level support declaration/statement phải chuyển về owner feature; route chỉ được export ${[...routeModuleExports].join(', ')}`,
    );
  }
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
    const isLibModule =
      appRelativePath.startsWith('lib/') || /^features\/[^/]+\/lib\//.test(appRelativePath);
    const isSharedComponent = appRelativePath.startsWith('components/');
    const isStorefrontFeatureComponent =
      app === 'apps/storefront' && /^features\/[^/]+\/components\//.test(appRelativePath);
    const isComponentFile = isSharedComponent || isStorefrontFeatureComponent;

    if (isLibModule && appRelativePath.endsWith('.tsx')) {
      failures.push(
        `${app}/app/${appRelativePath}: lib không chứa JSX; dùng .ts hoặc chuyển UI về components/`,
      );
    }

    if (isComponentFile) {
      if (/(^|\/)use-[^/]+\.tsx?$/.test(appRelativePath)) {
        failures.push(
          `${app}/app/${appRelativePath}: hook use-* phải ở hooks/ cùng cấp, không nằm trong components/`,
        );
      }

      const source = readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      for (const statement of sourceFile.statements) {
        const isExported =
          hasModifier(statement, ts.SyntaxKind.ExportKeyword) || ts.isExportDeclaration(statement);
        if (!isExported) continue;

        const hookNames = declaredNames(statement).filter((name) => /^use[A-Z]/.test(name));
        for (const hookName of hookNames) {
          failures.push(
            `${app}/app/${appRelativePath}:${sourceLocation(sourceFile, statement)}: exported hook ${hookName} phải ở hooks/ cùng cấp`,
          );
        }
      }
    }

    if (!appRelativePath.includes('.server.')) continue;
    if (appRelativePath === 'entry.server.tsx') continue;

    const sharedServerCorrectlyPlaced =
      app === 'apps/storefront'
        ? appRelativePath.startsWith('lib/server/')
        : appRelativePath.startsWith('lib/');
    const correctlyPlaced =
      sharedServerCorrectlyPlaced ||
      /^features\/[^/]+\/server\//.test(appRelativePath) ||
      appRelativePath.startsWith('routes/');
    if (!correctlyPlaced) {
      const sharedServerDirectory = app === 'apps/storefront' ? 'lib/server/' : 'lib/';
      failures.push(
        `${app}/app/${appRelativePath}: *.server.ts phải ở ${sharedServerDirectory} hoặc features/<name>/server/`,
      );
    }
  }

  // Dashboard documents the same thin-route convention but still has separate
  // implementation debt. Keep this semantic route-module gate storefront-only
  // until the dashboard route audit/refactor is complete.
  if (app !== 'apps/storefront') continue;

  const routesDirectory = join(appDirectory, 'routes');
  const routeFiles = sourceFiles(routesDirectory);
  const registeredRoutes = routeModuleNames(join(appDirectory, 'routes.ts'));
  const actualRoutes = new Set(
    routeFiles.map((file) => relative(appDirectory, file).split('\\').join('/')),
  );

  for (const routeModule of registeredRoutes) {
    if (!actualRoutes.has(routeModule)) {
      failures.push(
        `${app}/app/routes.ts: route module đã đăng ký nhưng không tồn tại: ${routeModule}`,
      );
    }
  }

  for (const file of routeFiles) {
    const appRelativePath = relative(appDirectory, file).split('\\').join('/');
    if (!registeredRoutes.has(appRelativePath)) {
      failures.push(
        `${app}/app/${appRelativePath}: support file không được nằm trong routes/; chỉ route module đăng ký bởi app/routes.ts được phép`,
      );
      continue;
    }

    const lines = readFileSync(file, 'utf8').split('\n').length;
    if (lines > maxRouteLines) {
      failures.push(
        `${relative(root, file)}: ${lines} dòng > ${maxRouteLines} — tách UI/loader sang features/`,
      );
    }

    validateRouteModule(app, appDirectory, file);
  }
}

if (failures.length > 0) {
  console.error(
    `Frontend structure check failed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}`,
  );
  process.exit(1);
}

console.log('Frontend structure check passed.');
