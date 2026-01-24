/**
 * Vite plugin for gonia.js.
 *
 * @remarks
 * - Auto-detects directive usage in templates and injects imports
 * - Transforms directive functions to add $inject arrays at build time
 * - Configures Vite for SSR with gonia.js
 *
 * @packageDocumentation
 */

import type { Plugin } from 'vite';

/**
 * Plugin options.
 */
export interface GoniaPluginOptions {
  /**
   * Automatically detect and import directives from source code.
   * @defaultValue true
   */
  autoDirectives?: boolean;

  /**
   * Additional directives to include (for runtime/dynamic cases).
   * Use directive names without the 'g-' prefix.
   * @example ['text', 'for', 'if']
   */
  includeDirectives?: string[];

  /**
   * Directives to exclude from auto-detection.
   * Use directive names without the 'g-' prefix.
   */
  excludeDirectives?: string[];
}

/**
 * Map of directive names to their export names from gonia.
 */
const DIRECTIVE_MAP: Record<string, string> = {
  text: 'text',
  html: 'html',
  show: 'show',
  template: 'template',
  slot: 'slot',
  class: 'cclass',
  model: 'model',
  on: 'on',
  for: 'cfor',
  if: 'cif',
};

/**
 * Detect directive names used in source code.
 */
function detectDirectives(code: string, id: string, isDev: boolean): Set<string> {
  const found = new Set<string>();

  // Pattern 1: g-name as attribute in template literals or strings
  // Matches: g-text, g-for, g-if, etc.
  const attrPattern = /g-([a-z]+)/g;
  let match;
  while ((match = attrPattern.exec(code)) !== null) {
    const name = match[1];
    if (DIRECTIVE_MAP[name]) {
      found.add(name);
    }
  }

  // Pattern 2: Dynamic directive names we can resolve
  // Matches: `g-${expr}` where expr is a string literal or simple variable
  const dynamicPattern = /`g-\$\{([^}]+)\}`/g;
  while ((match = dynamicPattern.exec(code)) !== null) {
    const expr = match[1].trim();

    // Try to resolve simple string literals
    if (/^['"]([a-z]+)['"]$/.test(expr)) {
      const name = expr.slice(1, -1);
      if (DIRECTIVE_MAP[name]) {
        found.add(name);
      }
    } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr)) {
      // It's a variable - try to find its value
      const varPattern = new RegExp(`(?:const|let|var)\\s+${expr}\\s*=\\s*['"]([a-z]+)['"]`);
      const varMatch = code.match(varPattern);
      if (varMatch && DIRECTIVE_MAP[varMatch[1]]) {
        found.add(varMatch[1]);
      } else if (isDev) {
        console.warn(
          `[gonia] Could not resolve directive name in \`g-\${${expr}}\` at ${id}\n` +
          `        Add to vite config: includeDirectives: ['expected-directive']`
        );
      }
    }
  }

  return found;
}

/**
 * Generate import statement for detected directives.
 */
function generateDirectiveImports(directives: Set<string>): string {
  if (directives.size === 0) return '';

  const imports: string[] = [];
  for (const name of directives) {
    const exportName = DIRECTIVE_MAP[name];
    if (exportName) {
      imports.push(exportName);
    }
  }

  if (imports.length === 0) return '';

  // Import from gonia/directives which auto-registers
  return `import { ${imports.join(', ')} } from 'gonia/directives';\n`;
}

/**
 * Transform source code to add $inject arrays to directive functions.
 */
function transformInject(code: string, id: string): { code: string; modified: boolean } {
  if (!code.includes('directive(')) {
    return { code, modified: false };
  }

  let result = code;
  let modified = false;

  const directiveCallPattern = /directive\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  const functionNames = new Set<string>();
  let match;

  while ((match = directiveCallPattern.exec(code)) !== null) {
    functionNames.add(match[2]);
  }

  if (functionNames.size === 0) {
    return { code, modified: false };
  }

  for (const fnName of functionNames) {
    if (code.includes(`${fnName}.$inject`)) continue;

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

    const directivePattern = new RegExp(
      `(directive\\s*\\(\\s*['"\`][^'"\`]+['"\`]\\s*,\\s*${fnName})`,
      'g'
    );

    const injectStatement = `${fnName}.$inject = ${JSON.stringify(params)};\n`;
    result = result.replace(directivePattern, `${injectStatement}$1`);
    modified = true;
  }

  return { code: result, modified };
}

/**
 * Gonia Vite plugin.
 *
 * @remarks
 * - Auto-detects directive usage and injects imports
 * - Adds $inject arrays to directive functions for minification safety
 * - Configures Vite for SSR with gonia.js
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
 *
 * @example
 * ```ts
 * // With options
 * export default defineConfig({
 *   plugins: [gonia({
 *     autoDirectives: true,
 *     includeDirectives: ['text', 'for'],  // For dynamic/runtime HTML
 *     excludeDirectives: ['model'],        // Never include these
 *   })]
 * });
 * ```
 */
export function gonia(options: GoniaPluginOptions = {}): Plugin {
  const {
    autoDirectives = true,
    includeDirectives = [],
    excludeDirectives = [],
  } = options;

  let isDev = false;

  // Track which directives have been injected per chunk
  const injectedModules = new Set<string>();

  return {
    name: 'gonia',
    enforce: 'pre',

    configResolved(config) {
      isDev = config.command === 'serve';
    },

    transform(code, id) {
      // Skip node_modules (except for $inject transform in gonia itself)
      const isGoniaInternal = id.includes('gonia') && id.includes('node_modules');
      if (id.includes('node_modules') && !isGoniaInternal) return null;
      if (!/\.(ts|js|tsx|jsx|html)$/.test(id)) return null;

      let result = code;
      let modified = false;

      // Collect directives to import
      if (!isGoniaInternal) {
        const detected = new Set<string>();

        // Auto-detect directives if enabled
        if (autoDirectives) {
          for (const name of detectDirectives(code, id, isDev)) {
            detected.add(name);
          }
        }

        // Add explicitly included directives (always, regardless of autoDirectives)
        for (const name of includeDirectives) {
          detected.add(name);
        }

        // Remove excluded directives
        for (const name of excludeDirectives) {
          detected.delete(name);
        }

        // Generate imports if we found directives and haven't already
        if (detected.size > 0 && !injectedModules.has(id)) {
          // Check if this file already imports from gonia/directives
          if (!code.includes("from 'gonia/directives'") && !code.includes('from "gonia/directives"')) {
            const importStatement = generateDirectiveImports(detected);
            if (importStatement) {
              result = importStatement + result;
              modified = true;
              injectedModules.add(id);
            }
          }
        }
      }

      // Transform $inject arrays
      const injectResult = transformInject(result, id);
      if (injectResult.modified) {
        result = injectResult.code;
        modified = true;
      }

      if (modified) {
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
