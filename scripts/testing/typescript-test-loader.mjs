import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts'];
const RESOLUTION_SUFFIXES = [
  ...TYPESCRIPT_EXTENSIONS,
  ...TYPESCRIPT_EXTENSIONS.map((extension) => `/index${extension}`),
];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (originalError) {
    if (!context.parentURL || !isPathSpecifier(specifier)) throw originalError;

    const pathname = new URL(specifier, context.parentURL).pathname;
    if (extname(pathname)) throw originalError;

    for (const suffix of RESOLUTION_SUFFIXES) {
      try {
        return await nextResolve(`${specifier}${suffix}`, context);
      } catch {
        // Try the next TypeScript file/index candidate.
      }
    }

    throw originalError;
  }
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !hasTypeScriptExtension(url)) {
    return nextLoad(url, context);
  }

  const filename = fileURLToPath(url);
  const source = await readFile(filename, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      isolatedModules: true,
      esModuleInterop: true,
      inlineSourceMap: true,
      inlineSources: true,
    },
  });

  if (result.diagnostics?.length) {
    throw new SyntaxError(
      ts.formatDiagnosticsWithColorAndContext(result.diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => '\n',
      }),
    );
  }

  return {
    format: 'module',
    source: result.outputText,
    shortCircuit: true,
  };
}

function isPathSpecifier(specifier) {
  return specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:');
}

function hasTypeScriptExtension(url) {
  const pathname = new URL(url).pathname;
  return TYPESCRIPT_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}
