/**
 * Server-side rendering with direct tree walking for directive indexing.
 *
 * @packageDocumentation
 */

import { Window } from 'happy-dom';
import { Mode, Directive, Expression, getDirective, RenderOptions, TemplateOption } from '../types.js';
import { createContext } from '../context.js';
import { processNativeSlot } from '../directives/slot.js';
import { registerProvider, registerDIProviders } from '../providers.js';
import { createElementScope, getElementScope } from '../scope.js';
import { FOR_PROCESSED_ATTR, FOR_TEMPLATE_ATTR } from '../directives/for.js';
import { IF_PROCESSED_ATTR } from '../directives/if.js';
import { PROCESSED_ATTR } from '../process.js';
import { resolveDependencies as resolveInjectables } from '../inject.js';
import { ContextKey } from '../context-registry.js';
import { applyAssigns, directiveNeedsScope } from '../directive-utils.js';
import { getTemplateAttrs, decodeHTMLEntities } from '../template-utils.js';
import { processBindAttributesOnce } from '../bind-utils.js';
import { createServerResolverConfig, ServiceRegistry } from '../resolver-config.js';
import { isAsyncFunction, FallbackSignal } from '../async.js';
import { getSelector, indexTree } from './index-tree.js';
import { getAsyncDepth, renderFallback } from './async-render.js';
import type { IndexedDirective } from './index-tree.js';
import type { StreamPendingChunk } from './async-render.js';

// Re-export types used by other modules
export type { IndexedDirective } from './index-tree.js';
export type { StreamPendingChunk } from './async-render.js';

/**
 * Registry of directives by name.
 */
export type DirectiveRegistry = Map<string, Directive>;

/** Registered services */
let services: ServiceRegistry = new Map();

// Re-export for backwards compatibility
export type { ServiceRegistry } from '../resolver-config.js';

/**
 * Register a directive in the registry.
 *
 * @param registry - The directive registry
 * @param name - Directive name
 * @param fn - The directive function
 *
 * @deprecated Use `directive()` from 'gonia' instead to register directives globally.
 */
export function registerDirective(
  registry: DirectiveRegistry,
  name: string,
  fn: Directive
): void {
  registry.set(name, fn);
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
 * Find the nearest scope by walking up the DOM tree.
 * Falls back to rootState if no element scope found.
 *
 * @internal
 */
function findServerScope(el: Element, rootState: Record<string, unknown>): Record<string, unknown> {
  let current: Element | null = el;

  while (current) {
    const scope = getElementScope(current);
    if (scope) {
      return scope;
    }
    current = current.parentElement;
  }

  return rootState;
}

/**
 * Resolve a template option and render it into an element.
 * Sets innerHTML, marks as prerendered, and re-indexes the subtree.
 *
 * @internal
 */
async function renderTemplate(
  el: Element,
  template: TemplateOption,
  selector: string,
  registry: DirectiveRegistry,
  index: IndexedDirective[],
  indexed: Set<Element>
): Promise<void> {
  const attrs = getTemplateAttrs(el);
  let templateHtml: string;
  if (typeof template === 'string') {
    templateHtml = template;
  } else {
    const result = template(attrs, el);
    templateHtml = result instanceof Promise ? await result : result;
  }
  el.innerHTML = templateHtml;
  el.setAttribute('data-g-prerendered', 'true');
  indexTree(el, selector, registry, index, indexed);
}

/**
 * Render HTML with directives on the server.
 *
 * @remarks
 * Uses direct tree walking to index elements with directive attributes,
 * then executes directives to produce the final HTML.
 * Directive attributes are preserved in output for client hydration.
 * Directives are processed in tree order (parents before children),
 * with priority used only for multiple directives on the same element.
 *
 * @param html - The HTML template string
 * @param state - The state object to use for expression evaluation
 * @param registry - The directive registry
 * @param renderOptions - Optional async rendering configuration
 * @param streamPending - Internal: collects pending chunks for stream mode
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
  registry: DirectiveRegistry,
  renderOptions?: RenderOptions,
  streamPending?: StreamPendingChunk[]
): Promise<string> {
  const window = new Window();
  const document = window.document;

  const index: IndexedDirective[] = [];
  const indexed = new Set<Element>(); // Track which elements have been indexed
  const selector = getSelector(registry);

  // Set HTML and index initial tree
  document.body.innerHTML = html;
  indexTree(document.body, selector, registry, index, indexed);

  const ctx = createContext(Mode.SERVER, state);
  const processed = new Set<Element>();

  // Async directive support: depth tracking and timeout
  const maxDepth = renderOptions?.maxDepth ?? 10;
  const depthMap = new WeakMap<Element, number>();

  let aborted = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (renderOptions?.timeout) {
    timeoutId = setTimeout(() => { aborted = true; }, renderOptions.timeout);
  }

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
      if (el.hasAttribute(FOR_PROCESSED_ATTR) || el.hasAttribute(IF_PROCESSED_ATTR) || el.hasAttribute(PROCESSED_ATTR)) {
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

      // Collect unique directive names for conflict detection
      const directiveNameSet = new Set<string>();
      for (const item of directives) {
        if (!item.isNativeSlot && item.directive !== null) {
          directiveNameSet.add(item.name);
        }
      }
      const directiveNames = [...directiveNameSet];

      // Check if any directive needs scope - create once if so
      // Must happen BEFORE g-scope and g-bind so assigns are available
      let elementScope: Record<string, unknown> | null = null;
      for (const name of directiveNames) {
        if (directiveNeedsScope(name)) {
          const parentScope = findServerScope(el, state);
          elementScope = createElementScope(el, parentScope);
          // Apply all assigns with conflict detection
          applyAssigns(elementScope, directiveNames);
          break;
        }
      }

      // Use element scope if created, otherwise find nearest ancestor
      const scopeState = elementScope ?? findServerScope(el, state);
      const scopeCtx = createContext(Mode.SERVER, scopeState);

      // Process g-scope (inline scope initialization)
      const scopeAttr = el.getAttribute('g-scope');
      if (scopeAttr) {
        const scopeValues = scopeCtx.eval<Record<string, unknown>>(decodeHTMLEntities(scopeAttr) as Expression);
        if (scopeValues && typeof scopeValues === 'object') {
          Object.assign(scopeState, scopeValues);
        }
      }

      // Process g-bind:* attributes (dynamic attribute binding)
      processBindAttributesOnce(el, scopeCtx, true);

      for (const item of directives) {
        // Check if element was disconnected by a previous directive (e.g., g-for replacing it)
        if (!item.el.isConnected) {
          break;
        }

        if (item.isNativeSlot) {
          processNativeSlot(item.el as unknown as HTMLSlotElement);
        } else if (item.isCustomElement) {
          // Custom element directive - must check before directive === null
          // because custom elements can have fn: null (template-only)
          const registration = getDirective(item.name);
          if (!registration) continue;

          const { fn, options } = registration;

          // Use pre-created scope or find existing
          const scopeState = elementScope ?? findServerScope(item.el, state);

          // Register DI providers if present
          if (options.provide) {
            registerDIProviders(item.el, options.provide);
          }

          // Async directive handling: check if fn is async and fallback is configured
          const fnIsAsync = fn && isAsyncFunction(fn);
          const hasFallback = options.fallback !== undefined;
          const ssrMode = options.ssr ?? 'await';

          if (fnIsAsync && hasFallback && ssrMode !== 'await') {
            // fallback or stream mode: skip running the fn on the server
            await renderFallback(item.el, options.fallback!, options, ssrMode, streamPending ? {
              fn: fn!,
              scopeState,
              rootState: state,
              expr: item.expr,
              using: options.using as ContextKey<unknown>[] | undefined,
              streamPending
            } : undefined);
          } else if (fnIsAsync && hasFallback && ssrMode === 'await') {
            // await mode: run the fn, await it, render template
            const depth = getAsyncDepth(item.el, depthMap);
            if (depth >= maxDepth || aborted) {
              // Over depth or timed out: render fallback
              await renderFallback(item.el, options.fallback!, options, 'await');
              item.el.setAttribute('data-g-async', aborted ? 'timeout' : 'timeout');
              if (depth >= maxDepth) {
                console.warn(`[gonia] Async directive '${item.name}' exceeded max depth (${maxDepth}), rendering fallback`);
              }
            } else {
              depthMap.set(item.el, depth + 1);
              const config = createServerResolverConfig(item.el, scopeState, state, services);
              const args = resolveInjectables(fn!, item.expr, item.el, scopeCtx.eval.bind(scopeCtx), config, options.using as ContextKey<unknown>[] | undefined);

              let didFallback = false;
              try {
                await (fn as (...args: unknown[]) => Promise<void>)(...args);

                // Check if timeout fired while fn was running
                if (aborted) {
                  didFallback = true;
                  await renderFallback(item.el, options.fallback!, options, 'await');
                  item.el.setAttribute('data-g-async', 'timeout');
                }
              } catch (e) {
                didFallback = true;
                await renderFallback(item.el, options.fallback!, options, 'await');
                item.el.setAttribute('data-g-async',
                  aborted ? 'timeout'
                    : e instanceof FallbackSignal ? 'pending'
                    : 'pending'
                );
              }

              if (!didFallback) {
                if (fn!.$context?.length) {
                  registerProvider(item.el, fn!, scopeState);
                }

                if (options.template) {
                  await renderTemplate(item.el, options.template, selector, registry, index, indexed);
                }
                item.el.setAttribute('data-g-async', 'loaded');
              }
            }
          } else {
            // Non-async path (original behavior)
            if (fn) {
              const config = createServerResolverConfig(item.el, scopeState, state, services);
              const args = resolveInjectables(fn, item.expr, item.el, scopeCtx.eval.bind(scopeCtx), config, options.using as ContextKey<unknown>[] | undefined);
              await (fn as (...args: unknown[]) => void | Promise<void>)(...args);

              if (fn.$context?.length) {
                registerProvider(item.el, fn, scopeState);
              }
            }

            if (options.template) {
              await renderTemplate(item.el, options.template, selector, registry, index, indexed);
            }
          }
        } else if (item.directive === null) {
          // Placeholder for g-scope - already processed above
          continue;
        } else {
          // Attribute directive - use pre-created scope or find existing
          const scopeState = elementScope ?? findServerScope(item.el, state);

          // Get registration options
          const registration = getDirective(item.name);
          const options = registration?.options ?? {};

          // Register DI providers if present
          if (options.provide) {
            registerDIProviders(item.el, options.provide);
          }

          const config = createServerResolverConfig(item.el, scopeState, state, services);
          const args = resolveInjectables(item.directive!, item.expr, item.el, scopeCtx.eval.bind(scopeCtx), config, item.using);
          await (item.directive as (...args: unknown[]) => void | Promise<void>)(...args);

          // Register as context provider if directive declares $context
          if (item.directive!.$context?.length) {
            registerProvider(item.el, item.directive!, scopeState);
          }
        }
      }
    }

    // Re-index tree to catch elements added by directives (e.g., g-template)
    indexTree(document.body, selector, registry, index, indexed);
  }

  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }

  return document.body.innerHTML;
}
