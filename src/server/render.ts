/**
 * Server-side rendering with direct tree walking for directive indexing.
 *
 * @packageDocumentation
 */

import { Window } from 'happy-dom';
import { Mode, Directive, Expression, DirectivePriority, Context, getDirective, getDirectiveNames, TemplateAttrs } from '../types.js';
import { createContext } from '../context.js';
import { processNativeSlot } from '../directives/slot.js';
import { registerProvider, resolveFromProviders, registerDIProviders, resolveFromDIProviders } from '../providers.js';
import { createElementScope, getElementScope } from '../scope.js';
import { FOR_PROCESSED_ATTR, FOR_TEMPLATE_ATTR } from '../directives/for.js';
import { IF_PROCESSED_ATTR } from '../directives/if.js';
import { PROCESSED_ATTR } from '../process.js';
import { resolveDependencies as resolveInjectables } from '../inject.js';
import { resolveContext, ContextKey } from '../context-registry.js';
import { applyAssigns, directiveNeedsScope } from '../directive-utils.js';

/**
 * Decode HTML entities that happy-dom doesn't decode.
 *
 * @internal
 */
function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

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

/**
 * Build a CSS selector for all registered directives.
 * Uses the global directive registry to support any prefix (g-, l-, v-, etc.).
 * Also includes local registry entries with g- prefix for backward compatibility.
 *
 * @internal
 */
function getSelector(localRegistry?: DirectiveRegistry): string {
  const selectors: string[] = [];

  for (const name of getDirectiveNames()) {
    const registration = getDirective(name);
    if (!registration) continue;

    const { options } = registration;

    // Custom element directives - match by tag name
    if (options.template || options.scope || options.provide || options.using) {
      selectors.push(name);
    }

    // All directives can be used as attributes
    selectors.push(`[${name}]`);
  }

  // Add local registry entries with g- prefix (backward compatibility)
  if (localRegistry) {
    for (const name of localRegistry.keys()) {
      const fullName = `g-${name}`;
      // Skip if already in global registry
      if (!getDirective(fullName)) {
        selectors.push(`[${fullName}]`);
      }
    }
  }

  // Also match native <slot> elements
  selectors.push('slot');
  // Match g-scope for inline scope initialization (TODO: make prefix configurable)
  selectors.push('[g-scope]');
  // Match common g-bind:* attributes for dynamic binding
  // These need to be indexed so their expressions can be evaluated with proper scope
  // Note: happy-dom doesn't need colon escaping (and escaped colons don't work)
  selectors.push('[g-bind:class]');
  selectors.push('[g-bind:style]');
  selectors.push('[g-bind:href]');
  selectors.push('[g-bind:src]');
  selectors.push('[g-bind:id]');
  selectors.push('[g-bind:value]');
  selectors.push('[g-bind:disabled]');
  selectors.push('[g-bind:checked]');
  selectors.push('[g-bind:placeholder]');
  selectors.push('[g-bind:title]');
  selectors.push('[g-bind:alt]');
  selectors.push('[g-bind:name]');
  selectors.push('[g-bind:type]');
  // Note: Can't do wildcard for data-* attributes in CSS, but hasBindAttributes handles them

  return selectors.join(',');
}

/**
 * Get template attributes from an element.
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
 * Create resolver config for server-side dependency resolution.
 *
 * @internal
 */
function createServerResolverConfig(
  el: Element,
  scopeState: Record<string, unknown>,
  rootState: Record<string, unknown>
) {
  return {
    resolveContext: (key: ContextKey<unknown>) => resolveContext(el, key),
    resolveState: () => scopeState,
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
  isCustomElement?: boolean;
  using?: ContextKey<unknown>[];
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
  const window = new Window();
  const document = window.document;

  const index: IndexedDirective[] = [];
  const indexed = new Set<Element>(); // Track which elements have been indexed
  const selector = getSelector(registry);

  /**
   * Index all directive elements in a subtree.
   * Called after innerHTML is set to discover new elements.
   */
  function indexTree(root: { querySelectorAll(selector: string): NodeListOf<Element> }): void {
    // Get all matching elements in the subtree
    const elements = root.querySelectorAll(selector);

    for (const match of elements) {
      // Skip if already indexed
      if (indexed.has(match)) continue;
      indexed.add(match);

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

      // Handle g-scope elements that don't have other directives
      if (match.hasAttribute('g-scope')) {
        let hasDirective = false;
        for (const name of getDirectiveNames()) {
          if (match.hasAttribute(name)) {
            hasDirective = true;
            break;
          }
        }
        if (!hasDirective) {
          index.push({
            el: match,
            name: 'scope',
            directive: null,
            expr: '' as Expression,
            priority: DirectivePriority.STRUCTURAL,
            isNativeSlot: false
          });
        }
      }

      // Handle g-bind:* elements that don't have other directives
      if (hasBindAttributes(match)) {
        let hasDirective = false;
        for (const name of getDirectiveNames()) {
          if (match.hasAttribute(name)) {
            hasDirective = true;
            break;
          }
        }
        if (!hasDirective && !match.hasAttribute('g-scope')) {
          index.push({
            el: match,
            name: 'bind',
            directive: null,
            expr: '' as Expression,
            priority: DirectivePriority.NORMAL,
            isNativeSlot: false
          });
        }
      }

      // Check all registered directives from global registry
      const tagName = match.tagName.toLowerCase();

      for (const name of getDirectiveNames()) {
        const registration = getDirective(name);
        if (!registration) continue;

        const { fn, options } = registration;

        // Check if this is a custom element directive (tag name matches)
        if (tagName === name) {
          if (options.template || options.scope || options.provide || options.using) {
            index.push({
              el: match,
              name,
              directive: fn,
              expr: '' as Expression,
              priority: fn?.priority ?? DirectivePriority.TEMPLATE,
              isCustomElement: true,
              using: options.using
            });
          }
        }

        // Check if this is an attribute directive
        const attr = match.getAttribute(name);
        if (attr !== null) {
          index.push({
            el: match,
            name,
            directive: fn,
            expr: decodeHTMLEntities(attr) as Expression,
            priority: fn?.priority ?? DirectivePriority.NORMAL,
            using: options.using
          });
        }
      }

      // Also check local registry for backward compatibility
      for (const [name, directive] of registry) {
        const attr = match.getAttribute(`g-${name}`);
        if (attr !== null) {
          // Skip if already added from global registry
          const fullName = `g-${name}`;
          if (getDirective(fullName)) continue;

          index.push({
            el: match,
            name,
            directive,
            expr: decodeHTMLEntities(attr) as Expression,
            priority: directive.priority ?? DirectivePriority.NORMAL
          });
        }
      }
    }
  }

  // Set HTML and index initial tree
  document.body.innerHTML = html;
  indexTree(document.body);

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

      // Process g-scope first (inline scope initialization)
      const scopeAttr = el.getAttribute('g-scope');
      if (scopeAttr) {
        const scopeValues = ctx.eval<Record<string, unknown>>(decodeHTMLEntities(scopeAttr) as Expression);
        if (scopeValues && typeof scopeValues === 'object') {
          Object.assign(state, scopeValues);
        }
      }

      // Process g-bind:* attributes (dynamic attribute binding)
      // Use the nearest ancestor scope for evaluation
      const bindScope = findServerScope(el, state);
      const bindCtx = createContext(Mode.SERVER, bindScope);
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('g-bind:')) {
          const targetAttr = attr.name.slice('g-bind:'.length);
          const value = bindCtx.eval(decodeHTMLEntities(attr.value) as Expression);
          if (value === null || value === undefined) {
            el.removeAttribute(targetAttr);
          } else {
            el.setAttribute(targetAttr, String(value));
          }
        }
      }

      // Collect unique directive names for conflict detection
      const directiveNameSet = new Set<string>();
      for (const item of directives) {
        if (!item.isNativeSlot && item.directive !== null) {
          directiveNameSet.add(item.name);
        }
      }
      const directiveNames = [...directiveNameSet];

      // Check if any directive needs scope - create once if so
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
          // Custom element directive - process template, scope, etc.
          const registration = getDirective(item.name);
          if (!registration) continue;

          const { fn, options } = registration;

          // Use pre-created scope or find existing
          const scopeState = elementScope ?? findServerScope(item.el, state);

          // Register DI providers if present
          if (options.provide) {
            registerDIProviders(item.el, options.provide);
          }

          // Call directive function if present (initializes state)
          if (fn) {
            const config = createServerResolverConfig(item.el, scopeState, state);
            const args = resolveInjectables(fn, item.expr, item.el, ctx.eval.bind(ctx), config, options.using);
            await (fn as (...args: unknown[]) => void | Promise<void>)(...args);

            // Register as context provider if directive declares $context
            if (fn.$context?.length) {
              registerProvider(item.el, fn, scopeState);
            }
          }

          // Render template if present
          if (options.template) {
            const attrs = getTemplateAttrs(item.el);
            let templateHtml: string;

            if (typeof options.template === 'string') {
              templateHtml = options.template;
            } else {
              const result = options.template(attrs, item.el);
              templateHtml = result instanceof Promise ? await result : result;
            }

            item.el.innerHTML = templateHtml;
            // Index new elements from the template
            indexTree(item.el);
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

          const config = createServerResolverConfig(item.el, scopeState, state);
          const args = resolveInjectables(item.directive!, item.expr, item.el, ctx.eval.bind(ctx), config, item.using);
          await (item.directive as (...args: unknown[]) => void | Promise<void>)(...args);

          // Register as context provider if directive declares $context
          if (item.directive!.$context?.length) {
            registerProvider(item.el, item.directive!, scopeState);
          }
        }
      }
    }

    // Re-index tree to catch elements added by directives (e.g., g-template)
    indexTree(document.body);
  }

  return document.body.innerHTML;
}
