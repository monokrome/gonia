/**
 * Context and DI provider system for sharing state and services across directive descendants.
 *
 * @packageDocumentation
 */

import { Directive } from './types.js';
import { reactive } from './reactivity.js';

/**
 * Local state stored per element.
 *
 * @internal
 */
const localStates = new WeakMap<Element, Record<string, unknown>>();

/**
 * Context provider info stored per element ($context).
 * Maps element -> { directive, state }
 *
 * @internal
 */
interface ContextProviderInfo {
  directive: Directive;
  state: Record<string, unknown>;
}

const contextProviders = new WeakMap<Element, ContextProviderInfo>();

/**
 * DI provider maps stored per element (provide option).
 * Maps element -> { name: value }
 *
 * @internal
 */
const diProviders = new WeakMap<Element, Record<string, unknown>>();

/**
 * Get or create local state for an element.
 *
 * @remarks
 * Each directive instance gets its own isolated state object.
 * The state is reactive.
 *
 * @param el - The element to get state for
 * @returns A reactive state object
 *
 * @internal
 */
export function getLocalState(el: Element): Record<string, unknown> {
  let state = localStates.get(el);
  if (!state) {
    state = reactive({});
    localStates.set(el, state);
  }
  return state;
}

/**
 * Register a context provider for an element.
 *
 * @remarks
 * Called after a directive with `$context` has executed.
 * Stores the directive and its state so descendants can find it.
 *
 * @param el - The element providing context
 * @param directive - The directive that provides context
 * @param state - The directive's local state
 *
 * @internal
 */
export function registerProvider(
  el: Element,
  directive: Directive,
  state: Record<string, unknown>
): void {
  contextProviders.set(el, { directive, state });
}

/**
 * Register DI providers for an element.
 *
 * @remarks
 * Called when a directive with `provide` option is processed.
 * Stores the provider map so descendants can resolve from it.
 *
 * @param el - The element providing DI overrides
 * @param provideMap - Map of name to value
 *
 * @internal
 */
export function registerDIProviders(
  el: Element,
  provideMap: Record<string, unknown>
): void {
  diProviders.set(el, provideMap);
}

/**
 * Resolve a DI provider value from ancestor elements.
 *
 * @remarks
 * Walks up the DOM tree to find the nearest ancestor with a
 * `provide` map containing the requested name.
 *
 * @param el - The element requesting the value
 * @param name - The name to look up
 * @returns The provided value, or undefined if not found
 *
 * @internal
 */
export function resolveFromDIProviders(
  el: Element,
  name: string
): unknown | undefined {
  let current: Element | null = el.parentElement;

  while (current) {
    const provideMap = diProviders.get(current);
    if (provideMap && name in provideMap) {
      return provideMap[name];
    }
    current = current.parentElement;
  }

  return undefined;
}

/**
 * Resolve a context value from ancestor elements.
 *
 * @remarks
 * Walks up the DOM tree to find the nearest ancestor whose
 * directive declares `$context` containing the requested name.
 *
 * @param el - The element requesting the value
 * @param name - The name to look up
 * @returns The provider's state, or undefined if not found
 *
 * @internal
 */
export function resolveFromProviders(
  el: Element,
  name: string
): Record<string, unknown> | undefined {
  let current: Element | null = el.parentElement;

  while (current) {
    const info = contextProviders.get(current);
    if (info?.directive.$context?.includes(name)) {
      return info.state;
    }
    current = current.parentElement;
  }

  return undefined;
}

/**
 * Clear local state for an element.
 *
 * @remarks
 * Called when an element is removed or re-rendered.
 *
 * @param el - The element to clear state for
 *
 * @internal
 */
export function clearLocalState(el: Element): void {
  localStates.delete(el);
}

/**
 * Clear providers for an element.
 *
 * @remarks
 * Called when an element is removed or re-rendered.
 *
 * @param el - The element to clear providers for
 *
 * @internal
 */
export function clearProvider(el: Element): void {
  contextProviders.delete(el);
  diProviders.delete(el);
}
