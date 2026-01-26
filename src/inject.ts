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

/**
 * An injectable dependency - either a string name or a typed context key.
 */
export type Injectable = string | ContextKey<unknown>;

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
  $inject?: readonly Injectable[];
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
 * // Production - explicit annotation with context keys
 * myDirective.$inject = ['$element', SlotContentContext];
 * getInjectables(myDirective); // ['$element', SlotContentContext]
 * ```
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
