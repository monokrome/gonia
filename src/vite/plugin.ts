/**
 * Vite plugin for gonia.js.
 *
 * @remarks
 * Transforms directive functions to add $inject arrays at build time,
 * making the code minification-safe without manual annotations.
 *
 * @packageDocumentation
 */

import type { Plugin } from 'vite';

/**
 * Parse function parameters from a function string.
 */
function parseParams(fnStr: string): string[] | null {
  // Match function parameters: handles regular, arrow, and async functions
  const match = fnStr.match(/^[^(]*\(([^)]*)\)/);
  if (!match) return null;

  const params = match[1];
  if (!params.trim()) return [];

  return params
    .split(',')
    .map(p => p.trim())
    // Remove type annotations (: Type)
    .map(p => p.replace(/\s*:.*$/, ''))
    // Remove default values (= value)
    .map(p => p.replace(/\s*=.*$/, ''))
    .filter(Boolean);
}

/**
 * Transform source code to add $inject arrays to directive functions.
 */
function transformCode(code: string, id: string): string | null {
  // Skip node_modules and non-JS/TS files
  if (id.includes('node_modules')) return null;
  if (!/\.(ts|js|tsx|jsx)$/.test(id)) return null;

  // Skip if no directive calls
  if (!code.includes('directive(')) return null;

  let result = code;
  let modified = false;

  // Pattern: directive('name', functionName, ...)
  // We need to find the function and add $inject to it
  const directiveCallPattern = /directive\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  const functionNames = new Set<string>();
  let match;

  while ((match = directiveCallPattern.exec(code)) !== null) {
    functionNames.add(match[2]);
  }

  if (functionNames.size === 0) return null;

  for (const fnName of functionNames) {
    // Skip if already has $inject
    if (code.includes(`${fnName}.$inject`)) continue;

    // Find function declaration: function fnName(params) or const fnName = (params) =>
    const fnDeclPattern = new RegExp(
      `(?:function\\s+${fnName}\\s*\\(([^)]*)\\)|(?:const|let|var)\\s+${fnName}\\s*=\\s*(?:async\\s*)?(?:function\\s*)?\\(([^)]*)\\))`,
      'g'
    );

    const fnMatch = fnDeclPattern.exec(code);
    if (!fnMatch) continue;

    const paramsStr = fnMatch[1] || fnMatch[2];
    if (!paramsStr) continue;

    const params = paramsStr
      .split(',')
      .map(p => p.trim())
      .map(p => p.replace(/\s*:.*$/, ''))
      .map(p => p.replace(/\s*=.*$/, ''))
      .filter(Boolean);

    if (params.length === 0) continue;

    // Find the directive() call and insert $inject before it
    const directivePattern = new RegExp(
      `(directive\\s*\\(\\s*['"\`][^'"\`]+['"\`]\\s*,\\s*${fnName})`,
      'g'
    );

    const injectStatement = `${fnName}.$inject = ${JSON.stringify(params)};\n`;
    result = result.replace(directivePattern, `${injectStatement}$1`);
    modified = true;
  }

  return modified ? result : null;
}

/**
 * Cubist.js Vite plugin.
 *
 * @remarks
 * Adds $inject arrays to directive functions for minification safety.
 * Also configures Vite for SSR with gonia.js.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { gonia } from 'gonia/vite';
 *
 * export default defineConfig({
 *   plugins: [gonia()]
 * });
 * ```
 */
export function gonia(): Plugin {
  return {
    name: 'gonia',
    enforce: 'pre',

    transform(code, id) {
      const result = transformCode(code, id);
      if (result) {
        return {
          code: result,
          map: null // TODO: proper source map support
        };
      }
      return null;
    },

    // Configure SSR
    config(config) {
      return {
        ...config,
        ssr: {
          ...config.ssr,
          // Ensure gonia is processed for SSR
          noExternal: ['gonia']
        }
      };
    }
  };
}

export default gonia;
