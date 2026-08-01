import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'src');
const sourceFiles = [];

async function collectFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(absolutePath);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      sourceFiles.push(absolutePath);
    }
  }
}

const toProjectPath = (absolutePath) =>
  path.relative(projectRoot, absolutePath).replaceAll(path.sep, '/');

const resolveLocalImport = (fromFile, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return candidates.find((candidate) => sourceFiles.includes(candidate)) ?? base;
};

const featureName = (projectPath) => {
  const match = /^src\/features\/([^/]+)\//.exec(projectPath);
  return match?.[1] ?? null;
};

await collectFiles(sourceRoot);
const errors = [];

for (const absolutePath of sourceFiles.sort()) {
  const projectPath = toProjectPath(absolutePath);
  const code = await readFile(absolutePath, 'utf8');
  const parsed = ts.createSourceFile(
    projectPath,
    code,
    ts.ScriptTarget.Latest,
    true,
    projectPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier.text;
    const resolved = resolveLocalImport(absolutePath, specifier);
    if (!resolved) continue;

    const importedPath = toProjectPath(resolved);
    const sourceFeature = featureName(projectPath);
    const importedFeature = featureName(importedPath);
    const line =
      parsed.getLineAndCharacterOfPosition(statement.getStart(parsed)).line + 1;

    if (projectPath.startsWith('src/app/') && importedPath.startsWith('src/features/')) {
      errors.push(
        `${projectPath}:${line} app modules may not import feature internals (${importedPath})`,
      );
    }

    if (
      sourceFeature &&
      importedFeature &&
      sourceFeature !== importedFeature
    ) {
      errors.push(
        `${projectPath}:${line} feature "${sourceFeature}" may not deep-import feature "${importedFeature}" (${importedPath})`,
      );
    }

    const isRootSharedModule =
      /^src\/[^/]+\.(ts|tsx)$/.test(projectPath) &&
      projectPath !== 'src/App.tsx' &&
      projectPath !== 'src/main.tsx';
    if (
      isRootSharedModule &&
      (importedPath.startsWith('src/app/') ||
        importedPath.startsWith('src/features/'))
    ) {
      errors.push(
        `${projectPath}:${line} shared root modules may not depend on app or feature modules (${importedPath})`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Import-boundary violations:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Import-boundary check passed for ${sourceFiles.length} files.`);
