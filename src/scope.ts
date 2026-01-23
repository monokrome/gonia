/**
 * Scope management for element state.
 *
 * @packageDocumentation
 */

import { reactive } from './reactivity.js';
import { createContext } from './context.js';
import { Mode, Directive, DirectiveOptions, Expression, EvalFn } from './types.js';
import { getInjectables } from './inject.js';

/** WeakMap to store element scopes */
const elementScopes = new WeakMap<Element, Record<string, unknown>>();

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
 * @returns The nearest scope, or undefined if none found
 */
export function findParentScope(
  el: Element,
  includeSelf = false
): Record<string, unknown> | undefined {
  let current: Element | null = includeSelf ? el : el.parentElement;

  while (current) {
    const scope = elementScopes.get(current);
    if (scope) {
      return scope;
    }
    current = current.parentElement;
  }

  return undefined;
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

      // Resolve dependencies and call directive
      const inject = getInjectables(fn);
      const args = inject.map((dep: string) => {
        switch (dep) {
          case '$element':
            return this;
          case '$state':
            return scope;
          case '$eval':
            return ctx.eval.bind(ctx);
          default:
            return undefined;
        }
      });

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
