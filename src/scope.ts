/**
 * Scope management for element state.
 *
 * @packageDocumentation
 */

import { reactive } from './reactivity.js';
import { createContext } from './context.js';
import { Mode, Directive, DirectiveOptions, Expression, EvalFn } from './types.js';
import { resolveDependencies } from './inject.js';
import { findAncestor } from './dom.js';
import { resolveContext, ContextKey } from './context-registry.js';

/** WeakMap to store element scopes */
const elementScopes = new WeakMap<Element, Record<string, unknown>>();

/** Root scope for top-level directives without explicit parent scope */
let rootScope: Record<string, unknown> | null = null;

/**
 * Get or create the root scope.
 *
 * @remarks
 * The root scope is used as a fallback for directives that aren't
 * inside an element with `scope: true`. This allows top-level
 * directives like `g-model` to work without requiring a parent scope.
 *
 * @returns The root reactive scope
 */
export function getRootScope(): Record<string, unknown> {
  if (!rootScope) {
    rootScope = reactive({});
  }
  return rootScope;
}

/**
 * Clear the root scope.
 *
 * @remarks
 * Primarily useful for testing.
 */
export function clearRootScope(): void {
  rootScope = null;
}

/**
 * Create a new scope for an element.
 *
 * @param el - The element to create scope for
 * @param parentScope - Optional parent scope to inherit from via prototype
 * @returns The new reactive scope
 */
export function createElementScope(
  el: Element,
  parentScope?: Record<string, unknown>
): Record<string, unknown> {
  let scope: Record<string, unknown>;

  if (parentScope) {
    // Create new object with parent as prototype
    scope = reactive(Object.create(parentScope));
  } else {
    scope = reactive({});
  }

  elementScopes.set(el, scope);
  return scope;
}

/**
 * Get the scope for an element.
 *
 * @param el - The element
 * @returns The element's scope, or undefined if none
 */
export function getElementScope(el: Element): Record<string, unknown> | undefined {
  return elementScopes.get(el);
}

/**
 * Find the nearest ancestor scope by walking up the DOM tree.
 *
 * @param el - The element to start from
 * @param includeSelf - Whether to check the element itself (default: false)
 * @param useRootFallback - Whether to return root scope if no parent found (default: true)
 * @returns The nearest scope, or root scope if none found and fallback enabled
 */
export function findParentScope(
  el: Element,
  includeSelf = false,
  useRootFallback = true
): Record<string, unknown> | undefined {
  const scope = findAncestor(el, (e) => elementScopes.get(e), includeSelf);

  if (scope) {
    return scope;
  }

  // Fall back to root scope for top-level directives
  return useRootFallback ? getRootScope() : undefined;
}

/**
 * Remove scope for an element (cleanup).
 *
 * @param el - The element
 */
export function removeElementScope(el: Element): void {
  elementScopes.delete(el);
}

/**
 * Register a directive as a custom element.
 *
 * @param name - The custom element name (must contain hyphen)
 * @param fn - The directive function
 * @param options - Directive options
 */
export function registerDirectiveElement(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: Directive<any>,
  options: DirectiveOptions
): void {
  // Don't re-register if already defined
  if (customElements.get(name)) {
    return;
  }

  customElements.define(name, class extends HTMLElement {
    connectedCallback() {
      // Find parent scope for prototype chain
      const parentScope = findParentScope(this);

      // Create this element's scope
      const scope = createElementScope(this, parentScope);

      // Create context for expression evaluation
      const ctx = createContext(Mode.CLIENT, scope);

      // Resolve dependencies using shared resolver
      const config = {
        resolveContext: (key: ContextKey<unknown>) => resolveContext(this, key),
        resolveState: () => scope,
        mode: 'client' as const
      };

      const args = resolveDependencies(fn, '', this, ctx.eval.bind(ctx), config, options.using);
      const result = fn(...args);

      // Handle async directives
      if (result instanceof Promise) {
        result.catch(err => console.error(`Error in ${name}:`, err));
      }
    }

    disconnectedCallback() {
      removeElementScope(this);
    }
  });
}
