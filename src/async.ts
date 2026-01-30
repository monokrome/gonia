/**
 * Shared utilities for async directive handling.
 *
 * @packageDocumentation
 */

/**
 * Detect whether a function is async (declared with `async` keyword).
 *
 * @param fn - The function to check
 * @returns true if fn is an AsyncFunction
 */
export function isAsyncFunction(fn: Function): boolean {
  return fn.constructor.name === 'AsyncFunction';
}

/** Counter for generating unique streaming IDs */
let asyncIdCounter = 0;

/**
 * Generate a unique ID for streaming placeholders.
 *
 * @returns A unique string ID like "g-async-0", "g-async-1", etc.
 */
export function generateAsyncId(): string {
  return `g-async-${asyncIdCounter++}`;
}

/**
 * Reset the async ID counter. For testing only.
 */
export function resetAsyncIdCounter(): void {
  asyncIdCounter = 0;
}
