/**
 * Vite plugin for gonia.js.
 *
 * @remarks
 * - Auto-detects directive usage in templates and injects imports
 * - Scans custom directive sources to build import map
 * - Transforms directive functions to add $inject arrays at build time
 * - Configures Vite for SSR with gonia.js
 *
 * @packageDocumentation
 */

import type { Plugin } from 'vite';
import { readFileSync } from 'fs';
import { glob } from 'tinyglobby';
import { resolve, relative, join } from 'path';

/**
 * Options for directive registration.
 */
export interface DirectiveOptionsConfig {
  scope?: boolean;
  template?: string | ((attrs: Record<string, string>) => string | Promise<string>);
  provide?: Record<string, unknown>;
}

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
   * Use full directive names (e.g., 'g-text', 'my-component').
   * @example ['g-text', 'g-for', 'app-header']
   */
  includeDirectives?: string[];

  /**
   * Directives to exclude from auto-detection.
   * Use full directive names.
   */
  excludeDirectives?: string[];

  /**
   * Glob patterns for files containing custom directive definitions.
   * The plugin scans these files at build start to discover directive() calls.
   * @example ['src/directives/**\/*.ts']
   */
  directiveSources?: string[];

  /**
   * Prefixes for attribute directives.
   * @defaultValue ['g-']
   * @example ['g-', 'v-', 'x-']
   */
  directiveAttributePrefixes?: string[];

  /**
   * Prefixes for element/component directives.
   * Defaults to directiveAttributePrefixes if not specified.
   * @example ['app-', 'my-', 'ui-']
   */
  directiveElementPrefixes?: string[];

  /**
   * Options to apply to directives.
   *
   * Can be an object mapping directive names to options, or a function
   * that receives the directive name and returns options.
   *
   * @example
   * ```ts
   * // Object form - explicit per-directive
   * directiveOptions: {
   *   'g-text': { scope: true },
   *   'app-card': { template: '<div class="card"><slot></slot></div>' }
   * }
   *
   * // Function form - dynamic/pattern-based
   * directiveOptions: (name) => name.startsWith('app-') ? { scope: true } : undefined
   * ```
   */
  directiveOptions?: Record<string, DirectiveOptionsConfig> | ((name: string) => DirectiveOptionsConfig | undefined);
}

/**
 * Gonia package.json field structure for libraries.
 */
interface GoniaPackageConfig {
  directives?: Record<string, string>;
}

/**
 * Scan dependencies for packages that export gonia directives.
 * Looks for `gonia` field in each dependency's package.json.
 */
function discoverLibraryDirectives(rootDir: string): Map<string, DirectiveInfo> {
  const directives = new Map<string, DirectiveInfo>();

  try {
    const pkgPath = join(rootDir, 'package.json');
    const pkgContent = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    for (const depName of Object.keys(allDeps)) {
      try {
        // Find the dependency's package.json
        const depPkgPath = join(rootDir, 'node_modules', depName, 'package.json');
        const depPkgContent = readFileSync(depPkgPath, 'utf-8');
        const depPkg = JSON.parse(depPkgContent);

        const goniaConfig: GoniaPackageConfig | undefined = depPkg.gonia;
        if (!goniaConfig?.directives) continue;

        // Register each directive from this package
        for (const [directiveName, relativePath] of Object.entries(goniaConfig.directives)) {
          // Resolve the module path
          const modulePath = `${depName}/${relativePath.replace(/^\.\//, '')}`;

          directives.set(directiveName, {
            name: directiveName,
            exportName: null, // Will be imported as default or named based on convention
            module: modulePath,
            isBuiltin: false,
          });
        }
      } catch {
        // Dependency doesn't have gonia config or couldn't be read - skip
      }
    }
  } catch {
    // Could not read root package.json - skip library discovery
  }

  return directives;
}

/**
 * Map of built-in directive names to their export names from gonia.
 */
const BUILTIN_DIRECTIVES: Record<string, { exportName: string; module: string }> = {
  'g-text': { exportName: 'text', module: 'gonia/directives' },
  'g-html': { exportName: 'html', module: 'gonia/directives' },
  'g-show': { exportName: 'show', module: 'gonia/directives' },
  'g-template': { exportName: 'template', module: 'gonia/directives' },
  'g-slot': { exportName: 'slot', module: 'gonia/directives' },
  'g-class': { exportName: 'cclass', module: 'gonia/directives' },
  'g-model': { exportName: 'model', module: 'gonia/directives' },
  'g-on': { exportName: 'on', module: 'gonia/directives' },
  'g-for': { exportName: 'cfor', module: 'gonia/directives' },
  'g-if': { exportName: 'cif', module: 'gonia/directives' },
};

/**
 * Information about a discovered directive.
 */
interface DirectiveInfo {
  name: string;
  exportName: string | null;
  module: string;
  isBuiltin: boolean;
}

/**
 * Scan a file for directive() calls and extract directive names.
 */
function scanFileForDirectives(filePath: string): Map<string, DirectiveInfo> {
  const directives = new Map<string, DirectiveInfo>();

  try {
    const content = readFileSync(filePath, 'utf-8');

    // Match directive('name', ...) or directive("name", ...)
    const pattern = /directive\s*\(\s*(['"`])([^'"`]+)\1/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const name = match[2];
      directives.set(name, {
        name,
        exportName: null,
        module: filePath,
        isBuiltin: false,
      });
    }
  } catch {
    // File read error - skip silently
  }

  return directives;
}

/**
 * Build regex pattern for matching directive attributes.
 */
function buildAttributePattern(prefixes: string[]): RegExp {
  const escaped = prefixes.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?:${escaped.join('|')})([a-zA-Z][a-zA-Z0-9-]*)`, 'g');
}

/**
 * Build regex pattern for matching directive elements (custom elements).
 */
function buildElementPattern(prefixes: string[]): RegExp {
  const escaped = prefixes.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`<((?:${escaped.join('|')})[a-zA-Z][a-zA-Z0-9-]*)`, 'g');
}

/**
 * Detect directive names used in source code.
 */
function detectDirectives(
  code: string,
  id: string,
  isDev: boolean,
  attributePrefixes: string[],
  elementPrefixes: string[],
  customDirectives: Map<string, DirectiveInfo>
): Set<string> {
  const found = new Set<string>();

  // Pattern for attribute directives (e.g., g-text, v-if)
  const attrPattern = buildAttributePattern(attributePrefixes);
  let match;

  while ((match = attrPattern.exec(code)) !== null) {
    // Reconstruct full attribute name
    const fullMatch = match[0];
    found.add(fullMatch);
  }

  // Pattern for element directives (e.g., <app-header>, <my-component>)
  const elemPattern = buildElementPattern(elementPrefixes);

  while ((match = elemPattern.exec(code)) !== null) {
    const elementName = match[1];
    found.add(elementName);
  }

  // Handle dynamic directive names we can resolve
  for (const prefix of attributePrefixes) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const dynamicPattern = new RegExp(`\`${escaped}\\$\\{([^}]+)\\}\``, 'g');

    while ((match = dynamicPattern.exec(code)) !== null) {
      const expr = match[1].trim();

      // Try to resolve simple string literals
      const literalMatch = expr.match(/^['"]([a-zA-Z][a-zA-Z0-9-]*)['"]$/);
      if (literalMatch) {
        found.add(prefix + literalMatch[1]);
        continue;
      }

      // Try to resolve variable
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr)) {
        const varPattern = new RegExp(`(?:const|let|var)\\s+${expr}\\s*=\\s*['"]([a-zA-Z][a-zA-Z0-9-]*)['"]`);
        const varMatch = code.match(varPattern);
        if (varMatch) {
          found.add(prefix + varMatch[1]);
        } else if (isDev) {
          console.warn(
            `[gonia] Could not resolve directive name in \`${prefix}\${${expr}}\` at ${id}\n` +
            `        Add to includeDirectives: ['${prefix}expected-name']`
          );
        }
      }
    }
  }

  return found;
}

/**
 * Get options for a directive from the directiveOptions config.
 */
function getDirectiveOptions(
  name: string,
  directiveOptions: GoniaPluginOptions['directiveOptions']
): DirectiveOptionsConfig | undefined {
  if (!directiveOptions) return undefined;

  if (typeof directiveOptions === 'function') {
    return directiveOptions(name);
  }

  return directiveOptions[name];
}

/**
 * Serialize directive options to a string for code generation.
 */
function serializeOptions(options: DirectiveOptionsConfig): string {
  const parts: string[] = [];

  if (options.scope !== undefined) {
    parts.push(`scope: ${options.scope}`);
  }

  if (options.template !== undefined) {
    if (typeof options.template === 'string') {
      parts.push(`template: ${JSON.stringify(options.template)}`);
    } else {
      // Function templates can't be serialized - warn and skip
      console.warn('[gonia] Function templates in directiveOptions are not supported. Use a string template.');
    }
  }

  if (options.provide !== undefined) {
    // provide can contain functions which can't be serialized
    console.warn('[gonia] "provide" in directiveOptions is not supported via plugin config.');
  }

  return `{ ${parts.join(', ')} }`;
}

/**
 * Generate import statements for detected directives.
 */
function generateImports(
  directives: Set<string>,
  customDirectives: Map<string, DirectiveInfo>,
  currentFile: string,
  rootDir: string,
  directiveOptions: GoniaPluginOptions['directiveOptions']
): string {
  if (directives.size === 0) return '';

  // Group by module
  const moduleImports = new Map<string, string[]>();
  // Track which directives need configuration
  const directivesToConfigure: Array<{ name: string; options: DirectiveOptionsConfig }> = [];

  for (const name of directives) {
    // Check if this directive has options
    const options = getDirectiveOptions(name, directiveOptions);
    if (options) {
      directivesToConfigure.push({ name, options });
    }

    // Check built-in first
    const builtin = BUILTIN_DIRECTIVES[name];
    if (builtin) {
      const imports = moduleImports.get(builtin.module) ?? [];
      if (!imports.includes(builtin.exportName)) {
        imports.push(builtin.exportName);
      }
      moduleImports.set(builtin.module, imports);
      continue;
    }

    // Check custom directives
    const custom = customDirectives.get(name);
    if (custom) {
      // For custom directives, we import the whole module (side effect)
      // since the directive() call registers it
      let modulePath = custom.module;

      // Make path relative to current file
      if (modulePath.startsWith('/') || modulePath.match(/^[a-zA-Z]:\\/)) {
        const relPath = relative(currentFile.replace(/[/\\][^/\\]+$/, ''), modulePath);
        modulePath = relPath.startsWith('.') ? relPath : './' + relPath;
        // Normalize to forward slashes and remove .ts extension for import
        modulePath = modulePath.replace(/\\/g, '/').replace(/\.tsx?$/, '.js');
      }

      // Side-effect import
      const imports = moduleImports.get(modulePath) ?? [];
      moduleImports.set(modulePath, imports);
    }
  }

  // Generate import statements
  const statements: string[] = [];

  // Add configureDirective import if we have options to apply
  if (directivesToConfigure.length > 0) {
    const goniaImports = moduleImports.get('gonia') ?? [];
    if (!goniaImports.includes('configureDirective')) {
      goniaImports.push('configureDirective');
    }
    moduleImports.set('gonia', goniaImports);
  }

  for (const [module, imports] of moduleImports) {
    if (imports.length > 0) {
      statements.push(`import { ${imports.join(', ')} } from '${module}';`);
    } else {
      // Side-effect import for custom directives
      statements.push(`import '${module}';`);
    }
  }

  // Add configureDirective calls
  for (const { name, options } of directivesToConfigure) {
    statements.push(`configureDirective('${name}', ${serializeOptions(options)});`);
  }

  return statements.length > 0 ? statements.join('\n') + '\n' : '';
}

/**
 * Split function parameters, respecting nested angle brackets in generics.
 */
function splitParams(paramsStr: string): string[] {
  const params: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of paramsStr) {
    if (char === '<') {
      depth++;
      current += char;
    } else if (char === '>') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    params.push(current.trim());
  }

  return params;
}

/**
 * Transform source code to add $inject arrays to directive functions.
 */
function transformInject(code: string): { code: string; modified: boolean } {
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

    const params = splitParams(paramsStr)
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
 * - Scans custom directive sources to discover user directives
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
 * // With custom directives
 * export default defineConfig({
 *   plugins: [gonia({
 *     directiveSources: ['src/directives/**\/*.ts'],
 *     directiveAttributePrefixes: ['g-'],
 *     directiveElementPrefixes: ['app-', 'ui-'],
 *   })]
 * });
 * ```
 */
export function gonia(options: GoniaPluginOptions = {}): Plugin {
  const {
    autoDirectives = true,
    includeDirectives = [],
    excludeDirectives = [],
    directiveSources = [],
    directiveAttributePrefixes = ['g-'],
    directiveElementPrefixes = options.directiveElementPrefixes ?? options.directiveAttributePrefixes ?? ['g-'],
    directiveOptions,
  } = options;

  let isDev = false;
  let rootDir = process.cwd();

  // Map of custom directive name -> DirectiveInfo
  const customDirectives = new Map<string, DirectiveInfo>();

  // Track which modules have been processed
  const injectedModules = new Set<string>();

  return {
    name: 'gonia',
    enforce: 'pre',

    configResolved(config) {
      isDev = config.command === 'serve';
      rootDir = config.root;
    },

    async buildStart() {
      // First, discover directives from installed libraries (lowest priority)
      const libraryDirectives = discoverLibraryDirectives(rootDir);
      for (const [name, info] of libraryDirectives) {
        customDirectives.set(name, info);
      }

      if (isDev && libraryDirectives.size > 0) {
        console.log(`[gonia] Discovered ${libraryDirectives.size} directive(s) from libraries`);
      }

      // Then scan local directive sources (higher priority - will override library)
      if (directiveSources.length > 0) {
        const files = await glob(directiveSources, {
          cwd: rootDir,
          absolute: true,
        });

        let localCount = 0;
        for (const file of files) {
          const directives = scanFileForDirectives(file);
          for (const [name, info] of directives) {
            customDirectives.set(name, info);
            localCount++;
          }
        }

        if (isDev && localCount > 0) {
          console.log(`[gonia] Discovered ${localCount} local directive(s)`);
        }
      }
    },

    transform(code, id) {
      // Skip node_modules (except for $inject transform in gonia itself)
      const isGoniaInternal = id.includes('/gonia/') && (id.includes('node_modules') || id.includes('/dist/'));
      if (id.includes('node_modules') && !isGoniaInternal) return null;
      if (!/\.(ts|js|tsx|jsx|html)$/.test(id)) return null;

      let result = code;
      let modified = false;

      // Collect directives to import
      if (!isGoniaInternal) {
        const detected = new Set<string>();

        // Auto-detect directives if enabled
        if (autoDirectives) {
          for (const name of detectDirectives(
            code,
            id,
            isDev,
            directiveAttributePrefixes,
            directiveElementPrefixes,
            customDirectives
          )) {
            detected.add(name);
          }
        }

        // Add explicitly included directives
        for (const name of includeDirectives) {
          detected.add(name);
        }

        // Remove excluded directives
        for (const name of excludeDirectives) {
          detected.delete(name);
        }

        // Generate imports if we found directives and haven't already
        // Skip HTML files - they're scanned for detection but imports go in JS
        const isHtmlFile = /\.html$/.test(id);
        if (detected.size > 0 && !injectedModules.has(id) && !isHtmlFile) {
          // Check if this file already imports from gonia/directives
          const hasGoniaImport = code.includes("from 'gonia/directives'") ||
                                  code.includes('from "gonia/directives"');

          // For custom directives, check if already imported
          const importStatement = generateImports(detected, customDirectives, id, rootDir, directiveOptions);

          if (importStatement && !hasGoniaImport) {
            result = importStatement + result;
            modified = true;
            injectedModules.add(id);
          }
        }
      }

      // Transform $inject arrays
      const injectResult = transformInject(result);
      if (injectResult.modified) {
        result = injectResult.code;
        modified = true;
      }

      if (modified) {
        return {
          code: result,
          map: null
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
