/**
 * Client-side hydration and runtime directive binding.
 *
 * @packageDocumentation
 */

import { Mode, Directive, Expression, DirectivePriority, Context, getDirective, getDirectiveNames, TemplateAttrs } from '../types.js';
import { createContext } from '../context.js';
import { processNativeSlot } from '../directives/slot.js';
import { getLocalState, registerProvider, resolveFromProviders, registerDIProviders, resolveFromDIProviders } from '../providers.js';
import { FOR_PROCESSED_ATTR } from '../directives/for.js';
import { findParentScope, createElementScope, getElementScope } from '../scope.js';
import { getInjectables } from '../inject.js';

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

/**
 * Service registry for dependency injection.
 */
export type ServiceRegistry = Map<string, unknown>;

/** Cached selector string */
let cachedSelector: string | null = null;

/** Whether init() has been called */
let initialized = false;

/** Registered services */
let services: ServiceRegistry = new Map();

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

    for (const name of registry.keys()) {
      directiveSelectors.push(`[g-${name}]`);
    }

    // Also match native <slot> elements
    directiveSelectors.push('slot');
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

  for (const [name, directive] of registry) {
    const attr = el.getAttribute(`g-${name}`);
    if (attr !== null) {
      directives.push({ name, directive, expr: attr });
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
 * Resolve dependencies for a directive based on its $inject array.
 *
 * @internal
 */
function resolveDependencies(
  directive: Directive,
  expr: Expression,
  el: Element,
  ctx: Context
): unknown[] {
  const inject = getInjectables(directive);

  return inject.map(name => {
    switch (name) {
      case '$expr':
        return expr;
      case '$element':
        return el;
      case '$eval':
        return ctx.eval.bind(ctx);
      case '$state':
        // Find nearest ancestor scope (including self)
        return findParentScope(el, true) ?? getLocalState(el);
      case '$rootState':
        // Deprecated: same as $state now (scoped state)
        return findParentScope(el, true) ?? getLocalState(el);
      case '$mode':
        return Mode.CLIENT;
      default: {
        // Look up in ancestor DI providers first (provide option)
        const diProvided = resolveFromDIProviders(el, name);
        if (diProvided !== undefined) {
          return diProvided;
        }

        // Look up in global services registry
        const service = services.get(name);
        if (service !== undefined) {
          return service;
        }

        // Look up in ancestor context providers ($context)
        const contextProvided = resolveFromProviders(el, name);
        if (contextProvided !== undefined) {
          return contextProvided;
        }

        throw new Error(`Unknown injectable: ${name}`);
      }
    }
  });
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

  const directives = getDirectivesForElement(el, registry);
  if (directives.length === 0) return;

  const ctx = getContextForElement(el);

  // Process directives sequentially, handling async ones properly
  let chain: Promise<void> | undefined;

  for (const { directive, expr } of directives) {
    const processDirective = () => {
      const args = resolveDependencies(directive, expr as Expression, el, ctx);
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
 * Extract template attributes from an element.
 *
 * @internal
 */
function getTemplateAttrs(el: Element): TemplateAttrs {
  const attrs: TemplateAttrs = {
    children: el.innerHTML
  };

  for (const attr of el.attributes) {
    attrs[attr.name] = attr.value;
  }

  return attrs;
}

/**
 * Process custom element directives (those with templates).
 * Directives with templates are web components and must be processed before
 * attribute directives so their content is rendered first.
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
  for (const name of getDirectiveNames()) {
    const registration = getDirective(name);
    if (!registration) {
      continue;
    }

    const { fn, options } = registration;

    // Only process directives with templates (web components),
    // scope: true, or provide (DI overrides)
    if (!options.template && !options.scope && !options.provide) {
      continue;
    }

    // Find all elements matching this directive's tag name
    const elements = document.querySelectorAll(name);
    for (const el of elements) {
      // Skip if already processed
      if (getElementScope(el)) {
        continue;
      }

      // 1. Create scope if needed
      let scope: Record<string, unknown> = {};
      if (options.scope) {
        const parentScope = findParentScope(el);
        scope = createElementScope(el, parentScope);
      } else {
        scope = findParentScope(el, true) ?? {};
      }

      // 2. Register DI providers if present (for descendants)
      if (options.provide) {
        registerDIProviders(el, options.provide);
      }

      // 3. Call directive function if present (initializes state)
      if (fn) {
        const ctx = createContext(Mode.CLIENT, scope);

        const inject = getInjectables(fn);
        const args = inject.map((dep: string) => {
          switch (dep) {
            case '$element':
              return el;
            case '$state':
              return scope;
            case '$eval':
              return ctx.eval.bind(ctx);
            default:
              return undefined;
          }
        });

        const result = fn(...args);

        if (result instanceof Promise) {
          await result;
        }
      }

      // 4. Render template if present (can query DOM for <template> elements etc)
      if (options.template) {
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
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        processNode(node as Element, selector, reg);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

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
