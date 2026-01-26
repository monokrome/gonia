/**
 * Type-safe context registry for sharing data across DOM ancestors/descendants.
 *
 * @remarks
 * Provides a unified system for registering and resolving typed context values
 * on DOM elements. Similar to React's Context or Vue's provide/inject but with
 * full type safety through branded context keys.
 *
 * @packageDocumentation
 */

import { findAncestor } from './dom.js';

/**
 * A branded context key that provides type safety for context values.
 *
 * @typeParam T - The type of value this context holds
 *
 * @remarks
 * The `__type` property is a phantom type - it doesn't exist at runtime
 * but provides compile-time type checking when registering and resolving.
 */
export interface ContextKey<T> {
  /** Unique identifier for this context */
  readonly id: symbol;
  /** Debug name for error messages */
  readonly name: string;
  /** Phantom type for TypeScript inference */
  readonly __type?: T;
}

/**
 * Storage for all contexts per element.
 *
 * @internal
 */
const contexts = new WeakMap<Element, Map<symbol, unknown>>();

/**
 * Create a typed context key.
 *
 * @typeParam T - The type of value this context will hold
 * @param name - Debug name for the context (used in error messages)
 * @returns A unique context key
 *
 * @example
 * ```ts
 * interface UserData {
 *   name: string;
 *   email: string;
 * }
 *
 * const UserContext = createContextKey<UserData>('User');
 *
 * // Register on an element
 * registerContext(el, UserContext, { name: 'Alice', email: 'alice@example.com' });
 *
 * // Resolve from a descendant - fully typed!
 * const user = resolveContext(childEl, UserContext);
 * // user is UserData | undefined
 * ```
 */
export function createContextKey<T>(name: string): ContextKey<T> {
  return {
    id: Symbol(name),
    name,
  };
}

/**
 * Register a context value on an element.
 *
 * @typeParam T - The context value type (inferred from key)
 * @param el - The element to register the context on
 * @param key - The context key
 * @param value - The value to store
 *
 * @remarks
 * Descendants can resolve this context using `resolveContext`.
 * If a context with the same key is already registered on this element,
 * it will be overwritten.
 *
 * @example
 * ```ts
 * const ThemeContext = createContextKey<{ mode: 'light' | 'dark' }>('Theme');
 *
 * registerContext(rootEl, ThemeContext, { mode: 'dark' });
 * ```
 */
export function registerContext<T>(
  el: Element,
  key: ContextKey<T>,
  value: T
): void {
  let map = contexts.get(el);
  if (!map) {
    map = new Map();
    contexts.set(el, map);
  }
  map.set(key.id, value);
}

/**
 * Resolve a context value from an ancestor element.
 *
 * @typeParam T - The context value type (inferred from key)
 * @param el - The element to start searching from
 * @param key - The context key to look for
 * @param includeSelf - Whether to check the element itself (default: false)
 * @returns The context value, or undefined if not found
 *
 * @remarks
 * Walks up the DOM tree from the element's parent (or the element itself
 * if `includeSelf` is true), looking for an ancestor with the specified
 * context registered.
 *
 * @example
 * ```ts
 * const ThemeContext = createContextKey<{ mode: 'light' | 'dark' }>('Theme');
 *
 * // Somewhere up the tree, ThemeContext was registered
 * const theme = resolveContext(el, ThemeContext);
 * if (theme) {
 *   console.log(theme.mode); // 'light' or 'dark'
 * }
 * ```
 */
export function resolveContext<T>(
  el: Element,
  key: ContextKey<T>,
  includeSelf = false
): T | undefined {
  return findAncestor(el, (e) => {
    const map = contexts.get(e);
    if (map?.has(key.id)) {
      return map.get(key.id) as T;
    }
    return undefined;
  }, includeSelf);
}

/**
 * Check if a context is registered on an element.
 *
 * @param el - The element to check
 * @param key - The context key
 * @returns True if the context is registered on this specific element
 *
 * @remarks
 * This only checks the element itself, not ancestors.
 * Use `resolveContext` to search up the tree.
 */
export function hasContext<T>(el: Element, key: ContextKey<T>): boolean {
  const map = contexts.get(el);
  return map?.has(key.id) ?? false;
}

/**
 * Remove a context from an element.
 *
 * @param el - The element to remove the context from
 * @param key - The context key to remove
 *
 * @remarks
 * Does nothing if the context wasn't registered.
 */
export function removeContext<T>(el: Element, key: ContextKey<T>): void {
  const map = contexts.get(el);
  if (map) {
    map.delete(key.id);
    if (map.size === 0) {
      contexts.delete(el);
    }
  }
}

/**
 * Clear all contexts from an element.
 *
 * @param el - The element to clear
 *
 * @remarks
 * Called during element cleanup/removal.
 */
export function clearContexts(el: Element): void {
  contexts.delete(el);
}
