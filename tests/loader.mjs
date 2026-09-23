import ts from 'typescript';
import { readFile, access } from 'node:fs/promises';

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) {
    const url = new URL(specifier + '.ts', context.parentURL);
    try { await access(url); return { url: url.href, shortCircuit: true }; } catch { /* Let Node resolve other modules. */ }
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith('.ts') && !url.includes('/node_modules/')) {
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(await readFile(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText };
  }
  return next(url, context);
}
