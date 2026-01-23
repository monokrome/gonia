/**
 * Template registry for reusable DOM.
 *
 * @remarks
 * Templates are just reusable HTML. The registry provides async access
 * to templates from various sources: inline `<template>` tags, fetched
 * files, or custom sources.
 *
 * @packageDocumentation
 */

/**
 * Interface for template retrieval.
 *
 * @remarks
 * Implementations can source templates from anywhere:
 * inline tags, files, network, bundled, etc.
 */
export interface TemplateRegistry {
  /**
   * Get a template by name.
   *
   * @param name - Template name/path
   * @returns The template HTML string
   */
  get(name: string): Promise<string>;
}

/**
 * Create a template registry with inline -> fetch fallback.
 *
 * @remarks
 * First checks for a `<template id="{name}">` in the document.
 * If not found, fetches from `/{name}` (or custom base path).
 * Results are cached.
 *
 * @param options - Configuration options
 * @returns A template registry
 *
 * @example
 * ```ts
 * // Default: inline -> fetch from /
 * const templates = createTemplateRegistry();
 *
 * // Custom base path
 * const templates = createTemplateRegistry({ basePath: '/templates/' });
 *
 * // Usage
 * const html = await templates.get('dialog');
 * ```
 */
export function createTemplateRegistry(options: {
  basePath?: string;
  fetch?: typeof globalThis.fetch;
} = {}): TemplateRegistry {
  const { basePath = '/', fetch: fetchFn = globalThis.fetch } = options;
  const cache = new Map<string, string>();

  return {
    async get(name: string): Promise<string> {
      if (cache.has(name)) {
        return cache.get(name)!;
      }

      // Try inline <template> first
      if (typeof document !== 'undefined') {
        const el = document.getElementById(name);
        if (el instanceof HTMLTemplateElement) {
          const html = el.innerHTML;
          cache.set(name, html);
          return html;
        }
      }

      // Fall back to fetch
      const url = basePath + name;
      const response = await fetchFn(url);

      if (!response.ok) {
        throw new Error(`Template not found: ${name} (${response.status})`);
      }

      const html = await response.text();
      cache.set(name, html);
      return html;
    }
  };
}

/**
 * Create a simple in-memory template registry.
 *
 * @remarks
 * Useful for testing or when templates are bundled.
 *
 * @param templates - Map of template names to HTML
 * @returns A template registry
 *
 * @example
 * ```ts
 * const templates = createMemoryRegistry({
 *   dialog: '<div class="dialog"><slot></slot></div>',
 *   card: '<div class="card"><slot name="title"></slot><slot></slot></div>'
 * });
 * ```
 */
export function createMemoryRegistry(
  templates: Record<string, string>
): TemplateRegistry {
  return {
    async get(name: string): Promise<string> {
      const html = templates[name];
      if (html === undefined) {
        throw new Error(`Template not found: ${name}`);
      }
      return html;
    }
  };
}

/**
 * Create a server-side template registry that reads from filesystem.
 *
 * @remarks
 * For Node.js/server environments. Reads templates from disk.
 *
 * @param readFile - Async file reader function
 * @param basePath - Base directory path
 * @returns A template registry
 *
 * @example
 * ```ts
 * import { readFile } from 'fs/promises';
 *
 * const templates = createServerRegistry(
 *   (path) => readFile(path, 'utf-8'),
 *   './templates/'
 * );
 * ```
 */
export function createServerRegistry(
  readFile: (path: string) => Promise<string>,
  basePath: string = './templates/'
): TemplateRegistry {
  const cache = new Map<string, string>();

  return {
    async get(name: string): Promise<string> {
      if (cache.has(name)) {
        return cache.get(name)!;
      }

      const path = basePath + name + '.html';
      const html = await readFile(path);
      cache.set(name, html);
      return html;
    }
  };
}
