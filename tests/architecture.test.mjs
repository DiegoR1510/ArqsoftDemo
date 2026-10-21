import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));

async function sources(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sources(filename));
    else if (/\.tsx?$/.test(filename)) result.push(filename);
  }
  return result;
}

test('las aplicaciones solo comparten contratos y utilidades de packages/', async () => {
  const apps = await readdir(path.join(root, 'apps'), { withFileTypes: true });
  const packageDirectories = await readdir(path.join(root, 'packages'));
  const allowed = new Set(packageDirectories.map((name) => `@kipu/${name}`));
  const violations = [];
  for (const app of apps.filter((entry) => entry.isDirectory())) {
    const appRoot = path.join(root, 'apps', app.name);
    for (const filename of await sources(path.join(appRoot, 'src'))) {
      const source = ts.createSourceFile(filename, await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true);
      function check(node) {
        const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
          ? node.moduleSpecifier
          : ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
             ts.isIdentifier(node.expression) && node.expression.text === 'require')
            ? node.arguments[0] : undefined;
        if (specifier && ts.isStringLiteral(specifier)) {
          const target = specifier.text;
          if (target.startsWith('@kipu/') && !allowed.has(target)) violations.push(`${filename}: ${target}`);
          if (target.startsWith('.') || path.isAbsolute(target)) {
            const resolved = path.resolve(path.dirname(filename), target);
            const withinApp = resolved.startsWith(`${appRoot}${path.sep}`);
            const withinPackages = resolved.startsWith(`${path.join(root, 'packages')}${path.sep}`);
            if (!withinApp && !withinPackages) violations.push(`${filename}: ${target}`);
          }
        }
        ts.forEachChild(node, check);
      }
      check(source);
    }
  }
  assert.deepEqual(violations, [], 'Una aplicación está importando código ajeno a su límite.');
});
