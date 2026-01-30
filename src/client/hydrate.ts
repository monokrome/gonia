/**
 * Client-side hydration and runtime directive binding.
 *
 * @packageDocumentation
 */

import { Mode, Directive, Expression, DirectivePriority, Context, getDirective, getDirectiveNames, FallbackOption } from '../types.js';
import { isAsyncFunction, FallbackSignal } from '../async.js';
import { createContext } from '../context.js';
import { processNativeSlot } from '../directives/slot.js';
import { getLocalState, registerProvider, registerDIProviders } from '../providers.js';
import { FOR_PROCESSED_ATTR } from '../directives/for.js';
import { findParentScope, createElementScope, getElementScope } from '../scope.js';
import { resolveDependencies as resolveInjectables } from '../inject.js';
import { ContextKey } from '../context-registry.js';
import { effect } from '../reactivity.js';
import { applyAssigns, directiveNeedsScope } from '../directive-utils.js';
import { getTemplateAttrs } from '../template-utils.js';
import { applyBindValue, getBindAttributes } from '../bind-utils.js';
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

/** Context cache by element */
const contextCache = new WeakMap<Element, Context>();

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
 * Parsed directive info.
 */
interface DirectiveMatch {
  name: string;
  directive: Directive;
  expr: string;
  using?: ContextKey<unknown>[];
}

/**
 * Get directives for an element, sorted by priority (highest first).
 *
 * @internal
 */
function getDirectivesForElement(
  el: Element,
  registry: DirectiveRegistry
): DirectiveMatch[] {
  const directives: DirectiveMatch[] = [];

  // Check local registry (built-in directives with g- prefix)
  for (const [name, directive] of registry) {
    const attr = el.getAttribute(`g-${name}`);
    if (attr !== null) {
      const registration = getDirective(`g-${name}`);
      directives.push({
        name,
        directive,
        expr: attr,
        using: registration?.options.using
      });
    }
  }

  // Check global registry (custom directives)
  for (const name of getDirectiveNames()) {
    // Skip if already matched via local registry
    if (directives.some(d => `g-${d.name}` === name)) continue;

    const attr = el.getAttribute(name);
    if (attr !== null) {
      const registration = getDirective(name);
      if (registration?.fn) {
        directives.push({
          name: name.replace(/^g-/, ''),
          directive: registration.fn,
          expr: attr,
          using: registration.options.using
        });
      }
    }
  }

  // Sort by priority (higher first)
  directives.sort((a, b) => {
    const priorityA = a.directive.priority ?? DirectivePriority.NORMAL;
    const priorityB = b.directive.priority ?? DirectivePriority.NORMAL;
    return priorityB - priorityA;
  });

  return directives;
}

/**
 * Get or create context for an element.
 *
 * @remarks
 * Walks up the DOM to find the nearest ancestor with a cached context,
 * then creates a context using the nearest scope.
 *
 * @internal
 */
function getContextForElement(el: Element): Context {
  // Check cache first
  const cached = contextCache.get(el);
  if (cached) return cached;

  // Walk up to find nearest context
  let current = el.parentElement;
  while (current) {
    const parentCtx = contextCache.get(current);
    if (parentCtx) {
      const ctx = parentCtx.child({});
      contextCache.set(el, ctx);
      return ctx;
    }
    current = current.parentElement;
  }

  // Find nearest scope or create empty one
  const scope = findParentScope(el, true) ?? createElementScope(el);
  const ctx = createContext(Mode.CLIENT, scope);
  contextCache.set(el, ctx);
  return ctx;
}

/**
 * Set context for an element (used by directives that create child contexts).
 *
 * @internal
 */
export function setElementContext(el: Element, ctx: Context): void {
  contextCache.set(el, ctx);
}

/**
 * Process directives on a single element.
 * Returns a promise if any directive is async, otherwise void.
 * Directives on the same element are processed sequentially to handle dependencies.
 *
 * @internal
 */
function processElement(
  el: Element,
  registry: DirectiveRegistry
): Promise<void> | void {
  // Skip elements already processed by g-for (they have their own child scope)
  if (el.hasAttribute(FOR_PROCESSED_ATTR)) {
    return;
  }

  // Handle native <slot> elements
  if (el.tagName === 'SLOT') {
    processNativeSlot(el);
    return;
  }

  // Handle template placeholders from SSR (g-if with false condition)
  if (el.tagName === 'TEMPLATE' && el.hasAttribute('data-g-if')) {
    const ifDirective = registry.get('if');
    if (ifDirective) {
      const expr = el.getAttribute('data-g-if') || '';
      const ctx = getContextForElement(el);
      const config = createClientResolverConfig(el, () => findParentScope(el, true) ?? getLocalState(el), services);
      const registration = getDirective('g-if');
      const args = resolveInjectables(ifDirective, expr, el, ctx.eval.bind(ctx), config, registration?.options.using);
      const result = (ifDirective as (...args: unknown[]) => void | Promise<void>)(...args);
      if (result instanceof Promise) {
        return result;
      }
    }
    return;
  }

  const directives = getDirectivesForElement(el, registry);
  const hasScopeAttr = el.hasAttribute('g-scope');
  const hasBindAttrs = [...el.attributes].some(a => a.name.startsWith('g-bind:'));

  // Skip if nothing to process
  if (directives.length === 0 && !hasScopeAttr && !hasBindAttrs) return;

  // Check if any directive needs a scope
  let scope = findParentScope(el, true) ?? {};
  let directiveCreatedScope = false;

  // Collect unique directive names for conflict detection
  const directiveNameSet = new Set<string>();

  for (const { name } of directives) {
    const fullName = `g-${name}`;
    const isNew = !directiveNameSet.has(fullName);
    directiveNameSet.add(fullName);

    // Only process first occurrence
    if (!isNew) continue;

    const registration = getDirective(fullName);
    if (!directiveCreatedScope && directiveNeedsScope(fullName)) {
      // Create a new scope that inherits from parent
      scope = createElementScope(el, scope);
      directiveCreatedScope = true;
    }

    // Register DI providers if present
    if (registration?.options.provide) {
      registerDIProviders(el, registration.options.provide);
    }
  }

  // Apply assigns with conflict detection
  if (directiveCreatedScope) {
    applyAssigns(scope, [...directiveNameSet]);
  }

  const ctx = createContext(Mode.CLIENT, scope);
  contextCache.set(el, ctx);

  // Process g-scope first (inline scope initialization)
  if (hasScopeAttr) {
    const scopeAttr = el.getAttribute('g-scope')!;
    const scopeValues = ctx.eval<Record<string, unknown>>(scopeAttr as Expression);
    if (scopeValues && typeof scopeValues === 'object') {
      Object.assign(scope, scopeValues);
    }
  }

  // Process g-bind:* attributes (dynamic attribute binding with reactivity)
  for (const [targetAttr, valueExpr] of getBindAttributes(el)) {
    effect(() => {
      const value = ctx.eval(valueExpr);
      applyBindValue(el, targetAttr, value);
    });
  }

  // Process directives sequentially, handling async ones properly
  let chain: Promise<void> | undefined;

  for (const { directive, expr, using } of directives) {
    const processDirective = () => {
      const config = createClientResolverConfig(el, () => findParentScope(el, true) ?? getLocalState(el), services);
      const args = resolveInjectables(directive, expr, el, ctx.eval.bind(ctx), config, using);
      const result = (directive as (...args: unknown[]) => void | Promise<void>)(...args);

      // Register as provider if directive declares $context
      if (directive.$context?.length) {
        const state = getLocalState(el);
        registerProvider(el, directive, state);
      }

      return result;
    };

    // STRUCTURAL directives (like g-for) take ownership of the element.
    // They remove the original and handle other directives on clones themselves.
    const isStructural = directive.priority === DirectivePriority.STRUCTURAL;

    if (chain instanceof Promise) {
      // Previous directive was async, chain this one after it
      chain = chain.then(() => {
        const result = processDirective();
        return result instanceof Promise ? result : undefined;
      });
    } else {
      // Previous directive was sync (or this is the first)
      const result = processDirective();
      if (result instanceof Promise) {
        chain = result;
      }
    }

    if (isStructural) {
      break;
    }
  }

  return chain;
}

/**
 * Process a node and its descendants for directives.
 * Returns a promise that resolves when all async directives complete.
 *
 * @internal
 */
function processNode(
  node: Element,
  selector: string,
  registry: DirectiveRegistry
): Promise<void> | void {
  const matches: Element[] = node.matches?.(selector) ? [node] : [];
  const descendants = [...(node.querySelectorAll?.(selector) ?? [])];
  const promises: Promise<void>[] = [];

  for (const el of [...matches, ...descendants]) {
    const result = processElement(el, registry);
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

  if (document.body && initialized) {
    const selector = `[g-${name}]`;
    for (const el of document.querySelectorAll(selector)) {
      processElement(el, registry);
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
 * Initialize the client-side framework.
 *
 * @remarks
 * Processes all existing elements with directive attributes, then
 * sets up a MutationObserver to handle dynamically added elements.
 * Works for both SSR hydration and pure client-side rendering.
 *
 * State is now scoped per custom element. Each element with `scope: true`
 * creates its own state that child elements inherit via prototype chain.
 *
 * @param registry - The directive registry
 *
 * @example
 * ```ts
 * const registry = new Map();
 * registry.set('text', textDirective);
 *
 * init(registry);
 * ```
 */
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
    try {
      await (fn as (...args: unknown[]) => Promise<void>)(...args);
    } catch (e) {
      if (e instanceof FallbackSignal) return;
      el.setAttribute('data-g-async', 'error');
      return;
    }

    await renderTemplateSwap(el, options);
    el.setAttribute('data-g-async', 'loaded');
    el.removeAttribute('data-g-async-id');

    if (fn.$context?.length) {
      const state = getLocalState(el);
      registerProvider(el, fn, state);
    }
  } else {
    // Pure client (no SSR attribute) — render fallback first, then swap
    await renderClientFallback(el, options);
    el.setAttribute('data-g-async', 'pending');

    try {
      await (fn as (...args: unknown[]) => Promise<void>)(...args);
    } catch (e) {
      if (e instanceof FallbackSignal) return;
      el.setAttribute('data-g-async', 'error');
      return;
    }

    await renderTemplateSwap(el, options);
    el.setAttribute('data-g-async', 'loaded');

    if (fn.$context?.length) {
      const state = getLocalState(el);
      registerProvider(el, fn, state);
    }
  }
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

export async function init(
  registry?: DirectiveRegistry
): Promise<void> {
  const reg = registry ?? getDefaultRegistry();
  cachedSelector = null;

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
    const result = processElement(el, reg);
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
        processNode(node as Element, selector, reg);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Streaming hydration hook: called by inline scripts from renderStream()
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__gonia_hydrate = (el: Element) => {
      processNode(el, selector, reg);
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
