/**
 * DOM traversal utilities.
 *
 * @packageDocumentation
 */

/**
 * Find an ancestor element matching a predicate.
 *
 * @remarks
 * Walks up the DOM tree starting from the element's parent (or the element
 * itself if `includeSelf` is true), calling the predicate on each ancestor.
 * Returns the first non-undefined result from the predicate.
 *
 * @typeParam T - The type returned by the predicate
 * @param el - The element to start from
 * @param predicate - Function called on each ancestor, returns a value or undefined
 * @param includeSelf - Whether to check the element itself (default: false)
 * @returns The first non-undefined result from the predicate, or undefined
 *
 * @example
 * ```ts
 * // Find ancestor with a specific attribute
 * const ancestor = findAncestor(el, (e) => e.hasAttribute('data-scope') ? e : undefined);
 *
 * // Find value from a WeakMap on an ancestor
 * const value = findAncestor(el, (e) => myWeakMap.get(e));
 * ```
 */
export function findAncestor<T>(
  el: Element,
  predicate: (el: Element) => T | undefined,
  includeSelf = false
): T | undefined {
  let current: Element | null = includeSelf ? el : el.parentElement;

  while (current) {
    const result = predicate(current);
    if (result !== undefined) {
      return result;
    }
    current = current.parentElement;
  }

  return undefined;
}
