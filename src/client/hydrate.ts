/**
 * Client-side hydration and runtime directive binding.
 *
 * @packageDocumentation
 */

import { Mode, Directive, Expression, getDirective, getDirectiveNames, FallbackOption, directive as registerGlobalDirective } from '../types.js';
import { isAsyncFunction, FallbackSignal } from '../async.js';
import { createContext } from '../context.js';
import { getLocalState, registerProvider, registerDIProviders } from '../providers.js';
import { PROCESSED_ATTR, setProcessServices, processDiscoveredElement } from '../process.js';
import { findParentScope, createElementScope, getElementScope } from '../scope.js';
import { resolveDependencies as resolveInjectables } from '../inject.js';
import { ContextKey } from '../context-registry.js';
import { applyAssigns } from '../directive-utils.js';
import { getTemplateAttrs } from '../template-utils.js';
import { createClientResolverConfig, ServiceRegistry } from '../resolver-config.js';

// Built-in directives
import { text } from '../directives/text.js';
import { show } from '../directives/show.js';
import { cclass } from '../directives/class.js';
import { model } from '../directives/model.js';
import { on } from '../directives/on.js';
import { cfor } from '../directives/for.js';
import { cif } from '../directives/if.js';

/**
 * Registry of directives by name.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DirectiveRegistry = Map<string, Directive<any>>;

// Re-export for backwards compatibility
export type { ServiceRegistry } from '../resolver-config.js';

/** Cached selector string */
let cachedSelector: string | null = null;

/** Whether init() has been called */
let initialized = false;

/** Registered services */
let services: ServiceRegistry = new Map();

/** Current MutationObserver (for cleanup) */
let observer: MutationObserver | null = null;

/** Default registry with built-in directives */
let defaultRegistry: DirectiveRegistry | null = null;

/**
 * Get the default directive registry with built-in directives.
 *
 * @internal
 */
function getDefaultRegistry(): DirectiveRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new Map();
    defaultRegistry.set('text', text);
    defaultRegistry.set('show', show);
    defaultRegistry.set('class', cclass);
    defaultRegistry.set('model', model);
    defaultRegistry.set('on', on);
    defaultRegistry.set('for', cfor);
    defaultRegistry.set('if', cif);
  }
  return defaultRegistry;
}

/**
 * Build a CSS selector for all registered directives.
 *
 * @internal
 */
function getSelector(registry: DirectiveRegistry): string {
  if (!cachedSelector) {
    const directiveSelectors: string[] = [];

    // Include directives from passed registry
    for (const name of registry.keys()) {
      directiveSelectors.push(`[g-${name}]`);
    }

    // Include directives from global registry
    for (const name of getDirectiveNames()) {
      directiveSelectors.push(`[${name}]`);
    }

    // Also match native <slot> elements
    directiveSelectors.push('slot');
    // Match template placeholders from SSR (g-if with false condition)
    directiveSelectors.push('template[data-g-if]');
    // Match g-scope for inline scope initialization
    directiveSelectors.push('[g-scope]');
    // Match g-bind:* for attribute bindings
    directiveSelectors.push('[g-bind\\:class]');
    cachedSelector = directiveSelectors.join(',');
  }
  return cachedSelector;
}

/**
 * Process directives on a single element via the unified processing path.
 *
 * @remarks
 * Delegates to processDiscoveredElement from process.ts, which handles
 * all directive types (built-in and custom) in a single code path.
 *
 * @internal
 */
function processElement(el: Element): Promise<void> | void {
  const parentScope = findParentScope(el, true) ?? {};
  const result = processDiscoveredElement(el, parentScope, Mode.CLIENT);
  return result?.chain;
}

/**
 * Process a node and its descendants for directives.
 * Returns a promise that resolves when all async directives complete.
 *
 * @internal
 */
function processNode(
  node: Element,
  selector: string
): Promise<void> | void {
  const matches: Element[] = node.matches?.(selector) ? [node] : [];
  const descendants = [...(node.querySelectorAll?.(selector) ?? [])];
  const promises: Promise<void>[] = [];

  for (const el of [...matches, ...descendants]) {
    const result = processElement(el);
    if (result instanceof Promise) {
      promises.push(result);
    }
  }

  if (promises.length > 0) {
    return Promise.all(promises).then(() => {});
  }
}

/**
 * Register a directive in the registry.
 *
 * @remarks
 * If called after hydration, scans the DOM for any elements using
 * this directive and processes them immediately.
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
  cachedSelector = null;

  // Ensure the directive is in the global registry
  if (!getDirective(`g-${name}`)) {
    registerGlobalDirective(`g-${name}`, fn);
  }

  if (document.body && initialized) {
    const selector = `[g-${name}]`;
    for (const el of document.querySelectorAll(selector)) {
      processElement(el);
    }
  }
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
 * Build a selector for custom element directives that need processing.
 *
 * @internal
 */
function getCustomElementSelector(): string {
  const selectors: string[] = [];

  for (const name of getDirectiveNames()) {
    const registration = getDirective(name);
    if (!registration) continue;

    const { options } = registration;

    // Only include directives with templates, scope, provide, using, or fallback
    if (options.template || options.scope || options.provide || options.using || options.fallback) {
      selectors.push(name);
    }
  }

  return selectors.join(',');
}

/**
 * Process custom element directives (those with templates).
 * Directives with templates are web components and must be processed before
 * attribute directives so their content is rendered first.
 *
 * Elements are processed in document order (parents before children) to ensure
 * parent scopes are initialized before child expressions are evaluated.
 *
 * Order for each element:
 * 1. Create scope (if scope: true)
 * 2. Call directive function (if fn exists) - initializes state
 * 3. Render template with (props, state) - can use initialized state
 * 4. Child directives are processed later by main hydration
 *
 * @internal
 */
async function processDirectiveElements(): Promise<void> {
  const selector = getCustomElementSelector();
  if (!selector) return;

  // Get all custom elements in document order (parents before children)
  const elements = document.querySelectorAll(selector);

  for (const el of elements) {
    // Skip if already processed
    if (getElementScope(el)) {
      continue;
    }

    // Find the directive registration for this element
    const name = el.tagName.toLowerCase();
    const registration = getDirective(name);
    if (!registration) {
      continue;
    }

    const { fn, options } = registration;

    // 1. Create scope if needed
    let scope: Record<string, unknown> = {};
    if (options.scope) {
      const parentScope = findParentScope(el);
      scope = createElementScope(el, parentScope);

      // Collect unique directive names on this element for conflict detection
      const directiveNameSet = new Set<string>([name]);
      for (const attr of el.attributes) {
        const attrReg = getDirective(attr.name);
        if (attrReg) {
          directiveNameSet.add(attr.name);
        }
      }

      // Apply assigns with conflict detection
      applyAssigns(scope, [...directiveNameSet]);
    } else {
      scope = findParentScope(el, true) ?? {};
    }

    // 2. Register DI providers if present (for descendants)
    if (options.provide) {
      registerDIProviders(el, options.provide);
    }

    // Async directive handling
    const fnIsAsync = fn && isAsyncFunction(fn);
    const hasFallback = options.fallback !== undefined;
    const asyncState = el.getAttribute('data-g-async');

    if (fnIsAsync && hasFallback) {
      await processAsyncDirectiveElement(el, fn, options, scope, asyncState);
    } else {
      // 3. Call directive function if present (initializes state)
      if (fn) {
        const ctx = createContext(Mode.CLIENT, scope);
        const config = createClientResolverConfig(el, () => scope, services);

        const args = resolveInjectables(fn, '', el, ctx.eval.bind(ctx), config, options.using);
        const result = fn(...args);

        if (result instanceof Promise) {
          await result;
        }
      }

      // 4. Render template if present (can query DOM for <template> elements etc)
      if (options.template) {
        if (el.hasAttribute('data-g-prerendered')) {
          el.removeAttribute('data-g-prerendered');
        } else {
          const attrs = getTemplateAttrs(el);
          let html: string;

          if (typeof options.template === 'string') {
            html = options.template;
          } else {
            const result = options.template(attrs, el);
            html = result instanceof Promise ? await result : result;
          }

          el.innerHTML = html;
        }
      }
    }
  }
}

/**
 * Process an async directive element based on its SSR state.
 *
 * @internal
 */
async function processAsyncDirectiveElement(
  el: Element,
  fn: Directive,
  options: { template?: unknown; fallback?: FallbackOption; using?: unknown[]; scope?: boolean; [key: string]: unknown },
  scope: Record<string, unknown>,
  asyncState: string | null
): Promise<void> {
  const ctx = createContext(Mode.CLIENT, scope);
  const config = createClientResolverConfig(el, () => scope, services);
  const args = resolveInjectables(fn, '', el, ctx.eval.bind(ctx), config, options.using as ContextKey<unknown>[] | undefined);

  if (asyncState === 'loaded') {
    // SSR already rendered the template — just run fn for reactivity setup
    try {
      await (fn as (...args: unknown[]) => Promise<void>)(...args);
    } catch (e) {
      if (e instanceof FallbackSignal) {
        await renderClientFallback(el, options);
        el.setAttribute('data-g-async', 'pending');
        return;
      }
    }

    if (el.hasAttribute('data-g-prerendered')) {
      el.removeAttribute('data-g-prerendered');
    }

    if (fn.$context?.length) {
      const state = getLocalState(el);
      registerProvider(el, fn, state);
    }
  } else if (asyncState === 'pending' || asyncState === 'streaming' || asyncState === 'timeout') {
    // SSR rendered fallback — run fn, swap to template on success
    const ok = await runAsyncAndSwap(el, fn, args, options);
    if (!ok) return;
    el.removeAttribute('data-g-async-id');
  } else {
    // Pure client (no SSR attribute) — render fallback first, then swap
    await renderClientFallback(el, options);
    el.setAttribute('data-g-async', 'pending');

    await runAsyncAndSwap(el, fn, args, options);
  }
}

/**
 * Run an async directive function, swap to template on success, and register provider.
 * Returns false if the fn threw FallbackSignal or an error.
 *
 * @internal
 */
async function runAsyncAndSwap(
  el: Element,
  fn: Directive,
  args: unknown[],
  options: { template?: unknown; [key: string]: unknown }
): Promise<boolean> {
  try {
    await (fn as (...args: unknown[]) => Promise<void>)(...args);
  } catch (e) {
    if (e instanceof FallbackSignal) return false;
    el.setAttribute('data-g-async', 'error');
    return false;
  }

  await renderTemplateSwap(el, options);
  el.setAttribute('data-g-async', 'loaded');

  if (fn.$context?.length) {
    const state = getLocalState(el);
    registerProvider(el, fn, state);
  }

  return true;
}

/**
 * Swap element content to its template.
 *
 * @internal
 */
async function renderTemplateSwap(
  el: Element,
  options: { template?: unknown; [key: string]: unknown }
): Promise<void> {
  if (!options.template) return;

  const attrs = getTemplateAttrs(el);
  let html: string;
  if (typeof options.template === 'string') {
    html = options.template as string;
  } else {
    const result = (options.template as (attrs: Record<string, string>, el: Element) => string | Promise<string>)(attrs, el);
    html = result instanceof Promise ? await result : result;
  }
  el.innerHTML = html;
}

/**
 * Render fallback content for an async directive on the client.
 *
 * @internal
 */
async function renderClientFallback(
  el: Element,
  options: { fallback?: FallbackOption; [key: string]: unknown }
): Promise<void> {
  if (!options.fallback) return;

  if (typeof options.fallback === 'string') {
    el.innerHTML = options.fallback;
  } else {
    const attrs = getTemplateAttrs(el);
    const result = options.fallback(attrs, el);
    el.innerHTML = result instanceof Promise ? await result : result;
  }
}

/**
 * Ensure local registry entries are in the global directive registry.
 *
 * @remarks
 * The local DirectiveRegistry predates the global registry. This bridges
 * them so processDiscoveredElement (which uses the global registry) can
 * find all directives.
 *
 * @internal
 */
function syncRegistryToGlobal(registry: DirectiveRegistry): void {
  for (const [name, fn] of registry) {
    if (!getDirective(`g-${name}`)) {
      registerGlobalDirective(`g-${name}`, fn);
    }
  }
}

/**
 * Initialize the client-side framework.
 *
 * @remarks
 * Processes all existing elements with directive attributes, then
 * sets up a MutationObserver to handle dynamically added elements.
 * Works for both SSR hydration and pure client-side rendering.
 *
 * @param registry - The directive registry
 */
export async function init(
  registry?: DirectiveRegistry
): Promise<void> {
  const reg = registry ?? getDefaultRegistry();
  cachedSelector = null;

  // Share service registry with process.ts for DI resolution in processElementTree
  setProcessServices(services);

  // Ensure local registry entries are globally available
  syncRegistryToGlobal(reg);

  // Process custom element directives first (those with templates or scope)
  // This ensures templates are rendered and scopes exist before child directives run
  await processDirectiveElements();

  const selector = getSelector(reg);

  // Process existing elements synchronously, collecting promises from async directives.
  // Note: We collect elements first, but some may be removed during processing
  // (e.g., g-for removes its template). Check isConnected before processing.
  const elements = document.querySelectorAll(selector);
  const promises: Promise<void>[] = [];

  for (const el of elements) {
    if (!el.isConnected) {
      continue;
    }
    const result = processElement(el);
    if (result instanceof Promise) {
      promises.push(result);
    }
  }

  // Wait for any async directives to complete
  if (promises.length > 0) {
    await Promise.all(promises);
  }

  // Set up MutationObserver for dynamic elements
  // Clean up previous observer if it exists
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        processNode(node as Element, selector);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Streaming hydration hook: called by inline scripts from renderStream()
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__gonia_hydrate = (el: Element) => {
      processNode(el, selector);
    };
  }

  initialized = true;
}

/**
 * Hydrate server-rendered HTML.
 *
 * @remarks
 * Alias for {@link init}. Use when hydrating SSR output.
 */
export const hydrate = init;

/**
 * Mount the framework on client-rendered HTML.
 *
 * @remarks
 * Alias for {@link init}. Use for pure client-side rendering.
 */
export const mount = init;

/**
 * Reset hydration state for testing.
 *
 * @remarks
 * Clears cached selector, disconnects observer, and resets initialized flag.
 * Primarily useful for testing.
 */
export function resetHydration(): void {
  cachedSelector = null;
  initialized = false;
  defaultRegistry = null;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
