/**
 * Shared utilities for async directive handling.
 *
 * @packageDocumentation
 */

/**
 * Thrown by `$fallback()` to signal that the directive wants fallback rendering.
 * The framework catches this at the directive execution boundary.
 */
export class FallbackSignal {
  readonly isFallbackSignal = true;
}

/**
 * Detect whether a function is async (declared with `async` keyword).
 *
 * @param fn - The function to check
 * @returns true if fn is an AsyncFunction
 */
export function isAsyncFunction(fn: Function): boolean {
  return fn.constructor.name === 'AsyncFunction';
}

