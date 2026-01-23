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
 * @returns Array of dependency names
 *
 * @example
 * ```ts
 * // Development - parsed from params
 * const myDirective = (expr, ctx, el, http, userService) => {};
 * getInjectables(myDirective); // ['expr', 'ctx', 'el', 'http', 'userService']
 *
 * // Production - explicit annotation
 * myDirective.$inject = ['http', 'userService'];
 * getInjectables(myDirective); // ['http', 'userService']
 * ```
 */
export function getInjectables(fn: InjectableFunction): string[] {
  if ('$inject' in fn && Array.isArray(fn.$inject)) {
    return fn.$inject;
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
