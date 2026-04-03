/**
 * Directive teardown/cleanup registry.
 *
 * Stores cleanup functions returned by directives and runs them
 * when elements are removed from the DOM.
 *
 * @packageDocumentation
 */

export type CleanupFn = () => void;

let cleanupMap = new WeakMap<Element, CleanupFn[]>();

/**
 * Register a cleanup function for an element.
 *
 * @param el - The element to associate the cleanup with
 * @param fn - The cleanup function to run when the element is removed
 */
export function registerCleanup(el: Element, fn: CleanupFn): void {
  let fns = cleanupMap.get(el);
  if (!fns) {
    fns = [];
    cleanupMap.set(el, fns);
  }
  fns.push(fn);
}

/**
 * Run and clear all cleanup functions for an element.
 *
 * @param el - The element whose cleanups should be run
 */
export function runCleanups(el: Element): void {
  const fns = cleanupMap.get(el);
  if (!fns) return;
  for (const fn of fns) {
    try {
      fn();
    } catch (e) {
      console.error('[gonia] Cleanup error:', e);
    }
  }
  cleanupMap.delete(el);
}

/**
 * Run cleanups for an element and all its descendants.
 *
 * @param el - The root element
 */
export function runCleanupsRecursive(el: Element): void {
  runCleanups(el);
  for (const desc of el.querySelectorAll('*')) {
    runCleanups(desc);
  }
}

/**
 * Reset the cleanup registry. For testing only.
 */
export function clearCleanupMap(): void {
  cleanupMap = new WeakMap();
}
