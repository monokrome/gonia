/**
 * Dependency injection utilities.
 *
 * @remarks
 * Supports two patterns:
 * 1. Explicit `$inject` array (minification-safe, production)
 * 2. Function parameter parsing (dev convenience, breaks when minified)
 *
 * Build tools should auto-generate `$inject` arrays for production builds,
 * similar to how ngAnnotate worked with AngularJS.
 *
 * @packageDocumentation
 */

import type { ContextKey } from './context-registry.js';
import type { Expression, EvalFn } from './types.js';
import { FallbackSignal } from './async.js';

/**
 * An injectable dependency name.
 * For ContextKey injection, use the `using` option on directive registration.
 */
export type Injectable = string;

/**
 * Check if a value is a ContextKey.
 */
export function isContextKey(value: unknown): value is ContextKey<unknown> {
  return typeof value === 'object' && value !== null && 'id' in value && typeof (value as ContextKey<unknown>).id === 'symbol';
}

/**
 * A function with optional `$inject` annotation.
 */
interface InjectableFunction extends Function {
  $inject?: readonly string[];
}

/**
 * Get the list of injectable dependencies for a function.
 *
 * @remarks
 * Checks for explicit `$inject` first, falls back to parsing params.
 * In production, always use `$inject` to survive minification.
 *
 * @param fn - The function to inspect
 * @returns Array of dependency names or context keys
 *
 * @example
 * ```ts
 * // Development - parsed from params
 * const myDirective = (expr, ctx, el, http, userService) => {};
 * getInjectables(myDirective); // ['expr', 'ctx', 'el', 'http', 'userService']
 *
 * // Production - explicit $inject array (survives minification)
 * myDirective.$inject = ['$element', '$scope'];
 * getInjectables(myDirective); // ['$element', '$scope']
 * ```
 *
 * For ContextKey injection, use the `using` option on directive registration.
 */
export function getInjectables(fn: InjectableFunction): Injectable[] {
  if ('$inject' in fn && Array.isArray(fn.$inject)) {
    return fn.$inject as Injectable[];
  }
  return parseFunctionParams(fn);
}

/**
 * Parse function parameters from function.toString().
 *
 * @remarks
 * Handles regular functions, arrow functions, async functions,
 * and default parameter values.
 *
 * @internal
 */
function parseFunctionParams(fn: Function): string[] {
  const str = fn.toString();

  const match = str.match(/^[^(]*\(([^)]*)\)/);
  if (!match) return [];

  const params = match[1];
  if (!params.trim()) return [];

  return params
    .split(',')
    .map(p => p.trim())
    .map(p => p.replace(/\s*=.*$/, ''))
    .filter(Boolean);
}

/**
 * Configuration for dependency resolution.
 */
export interface DependencyResolverConfig {
  /** Resolve a ContextKey to its value */
  resolveContext: (key: ContextKey<unknown>) => unknown;
  /** Resolve $scope injectable */
  resolveState: () => Record<string, unknown>;
  /** Resolve $rootState injectable (may be same as state) */
  resolveRootState?: () => Record<string, unknown>;
  /** Resolve custom injectable by name (services, providers) */
  resolveCustom?: (name: string) => unknown | undefined;
  /** Current mode */
  mode: 'server' | 'client';
}

/**
 * Resolve dependencies for a directive function.
 *
 * @remarks
 * Unified dependency resolution used by both client and server.
 * Handles $inject arrays, ContextKey injection, and the `using` option.
 *
 * @param fn - The directive function (with optional $inject)
 * @param expr - The expression string from the directive attribute
 * @param element - The target DOM element
 * @param evalFn - Function to evaluate expressions
 * @param config - Resolution configuration
 * @param using - Optional array of context keys to append
 * @returns Array of resolved dependency values
 */
export function resolveDependencies(
  fn: InjectableFunction,
  expr: Expression | string,
  element: Element,
  evalFn: EvalFn,
  config: DependencyResolverConfig,
  using?: ContextKey<unknown>[]
): unknown[] {
  const inject = getInjectables(fn);

  const args: unknown[] = inject.map(dep => {
    if (dep.startsWith('_')) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`Injectable '${dep}' starts with underscore — passing undefined.`);
      }
      return undefined;
    }

    switch (dep) {
      case '$expr':
        return expr;
      case '$element':
        return element;
      case '$eval':
        return evalFn;
      case '$scope':
        return config.resolveState();
      case '$rootState':
        return config.resolveRootState?.() ?? config.resolveState();
      case '$mode':
        return config.mode;
      case '$fallback':
        return (): never => { throw new FallbackSignal(); };
      default: {
        // Look up in custom resolver (services, providers, etc.)
        if (config.resolveCustom) {
          const resolved = config.resolveCustom(dep);
          if (resolved !== undefined) {
            return resolved;
          }
        }
        throw new Error(`Unknown injectable: ${dep}`);
      }
    }
  });

  // Append contexts from `using` option
  if (using?.length) {
    for (const key of using) {
      args.push(config.resolveContext(key));
    }
  }

  return args;
}
