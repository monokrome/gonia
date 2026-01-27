/**
 * Server-side rendering with MutationObserver-based directive indexing.
 *
 * @packageDocumentation
 */

import { parseHTML } from 'linkedom/worker';
import { Mode, Directive, Expression, DirectivePriority, Context, getDirective } from '../types.js';
import { createContext } from '../context.js';
import { processNativeSlot } from '../directives/slot.js';
import { getLocalState, registerProvider, resolveFromProviders, registerDIProviders, resolveFromDIProviders } from '../providers.js';
import { FOR_PROCESSED_ATTR, FOR_TEMPLATE_ATTR } from '../directives/for.js';
import { IF_PROCESSED_ATTR } from '../directives/if.js';
import { resolveDependencies as resolveInjectables } from '../inject.js';
import { resolveContext, ContextKey } from '../context-registry.js';

/**
 * Registry of directives by name.
 */
export type DirectiveRegistry = Map<string, Directive>;

/**
 * Service registry for dependency injection.
 */
export type ServiceRegistry = Map<string, unknown>;

/** Registered services */
let services: ServiceRegistry = new Map();

const selectorCache = new WeakMap<DirectiveRegistry, string>();

/**
 * Build a CSS selector for all registered directives.
 *
 * @internal
 */
function getSelector(registry: DirectiveRegistry): string {
  let selector = selectorCache.get(registry);
  if (!selector) {
    const directiveSelectors = [...registry.keys()].map(n => `[g-${n}]`);
    // Also match native <slot> elements
    directiveSelectors.push('slot');
    // Match g-scope for inline scope initialization
    directiveSelectors.push('[g-scope]');
    selector = directiveSelectors.join(',');
    selectorCache.set(registry, selector);
  }
  return selector;
}

/**
 * Check if element has any g-bind:* attributes.
 *
 * @internal
 */
function hasBindAttributes(el: Element): boolean {
  for (const attr of el.attributes) {
    if (attr.name.startsWith('g-bind:')) {
      return true;
    }
  }
  return false;
}

/**
 * Register a directive in the registry.
 *
 * @remarks
 * Invalidates the cached selector so it will be rebuilt on next render.
 *
 * @param registry - The directive registry
 * @param name - Directive name (without g- prefix)
 * @param fn - The directive function
 */
export function registerDirective(
  registry: DirectiveRegistry,
  name: string,
  fn: Directive
): void {
  registry.set(name, fn);
  selectorCache.delete(registry);
}

/**
 * Register a service for dependency injection.
 *
 * @param name - Service name (used in $inject arrays)
 * @param service - The service instance
 */
export function registerService(name: string, service: unknown): void {
  services.set(name, service);
}

/**
 * Create resolver config for server-side dependency resolution.
 *
 * @internal
 */
function createServerResolverConfig(el: Element, rootState: Record<string, unknown>) {
  return {
    resolveContext: (key: ContextKey<unknown>) => resolveContext(el, key),
    resolveState: () => getLocalState(el) ?? rootState,
    resolveRootState: () => rootState,
    resolveCustom: (name: string) => {
      // Look up in ancestor DI providers first (provide option)
      const diProvided = resolveFromDIProviders(el, name);
      if (diProvided !== undefined) return diProvided;

      // Look up in global services registry
      const service = services.get(name);
      if (service !== undefined) return service;

      // Look up in ancestor context providers ($context)
      return resolveFromProviders(el, name);
    },
    mode: 'server' as const
  };
}

/**
 * An indexed directive instance found in the DOM.
 *
 * @internal
 */
interface IndexedDirective {
  el: Element;
  name: string;
  directive: Directive | null; // null for native slots
  expr: Expression;
  priority: number;
  isNativeSlot?: boolean;
  using?: ContextKey<unknown>[];
}

/**
 * Render HTML with directives on the server.
 *
 * @remarks
 * Uses MutationObserver to index elements with directive attributes
 * as they are parsed, then executes directives to produce the final HTML.
 * Directive attributes are preserved in output for client hydration.
 * Directives are processed in tree order (parents before children),
 * with priority used only for multiple directives on the same element.
 *
 * @param html - The HTML template string
 * @param state - The state object to use for expression evaluation
 * @param registry - The directive registry
 * @returns The rendered HTML string
 *
 * @example
 * ```ts
 * const registry = new Map();
 * registry.set('text', textDirective);
 *
 * const html = await render(
 *   '<span g-text="user.name"></span>',
 *   { user: { name: 'Alice' } },
 *   registry
 * );
 * // '<span g-text="user.name">Alice</span>'
 * ```
 */
export async function render(
  html: string,
  state: Record<string, unknown>,
  registry: DirectiveRegistry
): Promise<string> {
  const { document, MutationObserver } = parseHTML(
    '<!DOCTYPE html><html><body></body></html>'
  );

  const index: IndexedDirective[] = [];
  const selector = getSelector(registry);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = node as Element;

        const matches: Element[] = el.matches(selector) ? [el] : [];
        const descendants = [...el.querySelectorAll(selector)];

        for (const match of [...matches, ...descendants]) {
          // Skip elements inside template content (used as placeholders)
          if (match.closest('template')) {
            continue;
          }

          // Handle native <slot> elements
          if (match.tagName === 'SLOT') {
            index.push({
              el: match,
              name: 'slot',
              directive: null,
              expr: '' as Expression,
              priority: DirectivePriority.NORMAL,
              isNativeSlot: true
            });
            continue;
          }

          for (const [name, directive] of registry) {
            const attr = match.getAttribute(`g-${name}`);
            if (attr !== null) {
              // Look up options from the global directive registry
              const registration = getDirective(`g-${name}`);
              index.push({
                el: match,
                name,
                directive,
                expr: attr as Expression,
                priority: directive.priority ?? DirectivePriority.NORMAL,
                using: registration?.options.using
              });
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  document.body.innerHTML = html;

  await new Promise(r => setTimeout(r, 0));

  const ctx = createContext(Mode.SERVER, state);
  const processed = new Set<Element>();

  // Process directives in rounds until no new elements are added
  let hasMore = true;
  while (hasMore) {
    // Group by element, preserving tree order from the index
    const elementOrder: Element[] = [];
    const byElement = new Map<Element, IndexedDirective[]>();

    for (const item of index) {
      if (processed.has(item.el)) continue;
      if (!byElement.has(item.el)) {
        elementOrder.push(item.el);
        byElement.set(item.el, []);
      }
      byElement.get(item.el)!.push(item);
    }

    if (elementOrder.length === 0) {
      hasMore = false;
      break;
    }

    // Process elements in tree order
    for (const el of elementOrder) {
      // Skip elements that were removed (e.g., by g-for cloning)
      if (!el.isConnected) {
        processed.add(el);
        continue;
      }

      // Skip elements already processed by structural directives (g-for, g-if)
      // These elements have their own scoped processing
      if (el.hasAttribute(FOR_PROCESSED_ATTR) || el.hasAttribute(IF_PROCESSED_ATTR)) {
        processed.add(el);
        continue;
      }

      // Skip template elements with g-for - these are template wrappers created by g-for
      // and should not be processed as directives (they're for client hydration)
      if (el.tagName === 'TEMPLATE' && el.hasAttribute('g-for')) {
        processed.add(el);
        continue;
      }

      // Skip template content elements - these are inside template wrappers
      // and their directives are processed by g-for when rendering items
      if (el.hasAttribute(FOR_TEMPLATE_ATTR)) {
        processed.add(el);
        continue;
      }

      processed.add(el);
      const directives = byElement.get(el)!;

      // Sort directives on this element by priority (higher first)
      directives.sort((a, b) => b.priority - a.priority);

      // Process g-scope first (inline scope initialization)
      const scopeAttr = el.getAttribute('g-scope');
      if (scopeAttr) {
        const scopeValues = ctx.eval<Record<string, unknown>>(scopeAttr as Expression);
        if (scopeValues && typeof scopeValues === 'object') {
          Object.assign(state, scopeValues);
        }
      }

      // Process g-bind:* attributes (dynamic attribute binding)
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('g-bind:')) {
          const targetAttr = attr.name.slice('g-bind:'.length);
          const value = ctx.eval(attr.value as Expression);
          if (value === null || value === undefined) {
            el.removeAttribute(targetAttr);
          } else {
            el.setAttribute(targetAttr, String(value));
          }
        }
      }

      for (const item of directives) {
        // Check if element was disconnected by a previous directive (e.g., g-for replacing it)
        if (!item.el.isConnected) {
          break;
        }

        if (item.isNativeSlot) {
          processNativeSlot(item.el as unknown as HTMLSlotElement);
        } else {
          const config = createServerResolverConfig(item.el, state);
          const args = resolveInjectables(item.directive!, item.expr, item.el, ctx.eval.bind(ctx), config, item.using);
          await (item.directive as (...args: unknown[]) => void | Promise<void>)(...args);

          // Register as context provider if directive declares $context
          if (item.directive!.$context?.length) {
            const localState = getLocalState(item.el);
            registerProvider(item.el, item.directive!, localState);
          }
        }
      }

      // Let observer catch new elements
      await new Promise(r => setTimeout(r, 0));
    }
  }

  observer.disconnect();

  return document.body.innerHTML;
}
