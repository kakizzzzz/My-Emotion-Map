import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'src');
const exceptions = JSON.parse(
  await readFile(
    path.join(projectRoot, 'scripts/source-size-exceptions.json'),
    'utf8',
  ),
);

const policies = {
  '.ts': { max: 1000, target: 450 },
  '.tsx': { max: 1000, target: 500 },
  '.css': { max: 1000, target: 700 },
};

const files = [];
async function collectFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(absolutePath);
    } else if (policies[path.extname(entry.name)]) {
      files.push(absolutePath);
    }
  }
}

await collectFiles(sourceRoot);

const violations = [];
const warnings = [];

for (const absolutePath of files.sort()) {
  const relativePath = path
    .relative(projectRoot, absolutePath)
    .replaceAll(path.sep, '/');
  const extension = path.extname(relativePath);
  const defaultPolicy = policies[extension];
  const exception = exceptions[relativePath];
  const policy = exception
    ? { max: exception.max, target: exception.target }
    : defaultPolicy;
  const source = await readFile(absolutePath, 'utf8');
  const lines = source.length === 0 ? 0 : source.split(/\r?\n/).length;

  if (lines > policy.max) {
    violations.push(
      `${relativePath}: ${lines} lines (hard limit ${policy.max})`,
    );
  } else if (lines > policy.target) {
    const debt = exception
      ? `; exception: ${exception.reason} [owner=${exception.owner}, removeBy=${exception.removeBy}]`
      : '';
    warnings.push(
      `${relativePath}: ${lines} lines (target ${policy.target}${debt})`,
    );
  }
}

if (warnings.length > 0) {
  console.warn('Source-size targets to improve:');
  for (const warning of warnings) console.warn(`  - ${warning}`);
}

if (violations.length > 0) {
  console.error('Source-size hard limits exceeded:');
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log(`Source-size check passed for ${files.length} files.`);
