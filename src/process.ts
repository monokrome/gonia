/**
 * Shared element processing for structural directives.
 *
 * @remarks
 * Provides a unified way to process directives on elements created by
 * structural directives like g-if and g-for. Supports scope reuse for
 * state preservation across re-renders.
 *
 * All descendant processing uses registry-based discovery via
 * {@link processSubtree} and {@link processDiscoveredElement}, which
 * handles ALL directive types in both client and server modes.
 *
 * @packageDocumentation
 */

import { Mode, Expression, Directive, DirectiveOptions, getDirective, DirectivePriority, Context } from './types.js';
import { createContext } from './context.js';
import { createScope, effect } from './reactivity.js';
import { resolveDependencies } from './inject.js';
import { resolveContext, ContextKey } from './context-registry.js';
import { getLocalState, registerProvider, registerDIProviders, resolveFromProviders, resolveFromDIProviders } from './providers.js';
import { createElementScope, setElementScope, getElementScope } from './scope.js';
import { processNativeSlot } from './directives/slot.js';
import { applyAssigns, directiveNeedsScope } from './directive-utils.js';
import { getBindAttributes, applyBindValue, processBindAttributesOnce } from './bind-utils.js';
import { decodeHTMLEntities } from './template-utils.js';
import { createCustomResolver, ServiceRegistry } from './resolver-config.js';

/** Attribute used to mark elements processed by g-for */
export const FOR_PROCESSED_ATTR = 'data-g-for-processed';

/** Attribute used to mark elements processed by structural directives */
export const PROCESSED_ATTR = 'data-g-processed';

/**
 * Options for processing element directives.
 */
export interface ProcessOptions {
  /**
   * Existing scope to use instead of creating a new one.
   * Use this to preserve state across re-renders (e.g., g-if toggle).
   */
  existingScope?: Record<string, unknown>;

  /**
   * Additional properties to add to the scope.
   * Used by g-for to add item/index variables.
   */
  scopeAdditions?: Record<string, unknown>;

  /**
   * Skip processing structural directives (g-for, g-if).
   * Set to true when processing content inside a structural directive
   * to avoid infinite recursion.
   */
  skipStructural?: boolean;
}

/** Module-level service registry for DI resolution */
let moduleServices: ServiceRegistry = new Map();

/**
 * Provide the service registry for process.ts to use during directive resolution.
 *
 * @remarks
 * Called by hydrate.ts during init() so that directives invoked through
 * processElementTree can resolve service dependencies.
 *
 * @param services - The global service registry
 */
export function setProcessServices(services: ServiceRegistry): void {
  moduleServices = services;
}

/**
 * Matched directive info for an element.
 *
 * @internal
 */
interface DirectiveMatch {
  fullName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  directive: Directive<any>;
  expr: string;
  options: DirectiveOptions;
}

/**
 * Get all directives for an element from the global registry, sorted by priority.
 *
 * @remarks
 * Iterates the element's own attributes and looks each up in the registry.
 * This is O(A) where A = attribute count (typically 1-5), rather than
 * O(R) where R = registry size.
 *
 * @internal
 */
function getDirectivesForElement(el: Element): DirectiveMatch[] {
  const directives: DirectiveMatch[] = [];

  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    const registration = getDirective(attr.name);
    if (!registration?.fn) continue;

    directives.push({
      fullName: attr.name,
      directive: registration.fn,
      expr: attr.value,
      options: registration.options
    });
  }

  if (directives.length > 1) {
    directives.sort((a, b) => {
      const pa = a.directive.priority ?? DirectivePriority.NORMAL;
      const pb = b.directive.priority ?? DirectivePriority.NORMAL;
      return pb - pa;
    });
  }

  return directives;
}

/**
 * Build a resolver config for dependency injection.
 *
 * @remarks
 * Works for both client and server modes. Uses the module-level service
 * registry and DOM-based provider resolution.
 *
 * @internal
 */
function buildResolverConfig(el: Element, scope: Record<string, unknown>, mode: Mode) {
  return {
    resolveContext: (key: ContextKey<unknown>) => resolveContext(el, key, true),
    resolveState: () => scope,
    resolveRootState: () => scope,
    resolveCustom: createCustomResolver(el, moduleServices),
    mode: mode === Mode.SERVER ? 'server' as const : 'client' as const
  };
}

/**
 * Result of preparing an element for directive processing.
 *
 * @remarks
 * Contains scope, context, and matched directives. All processing paths
 * (processDiscoveredElement, setupRootScope, hydrate processElement,
 * render.ts per-element) use this to avoid duplicating preprocessing logic.
 *
 * g-bind:* is NOT applied here — it runs after the directive loop so that
 * directives that detach the element (like g-for/g-if) naturally prevent
 * g-bind from running on the original.
 */
export interface PreparedElement {
  scope: Record<string, unknown>;
  ctx: Context;
  directives: DirectiveMatch[];
}

/**
 * Options for prepareElementScope.
 */
export interface PrepareOptions {
  /** Existing scope to reuse (e.g., persistent scope from g-if toggle) */
  existingScope?: Record<string, unknown>;
  /** Additional properties to merge into scope (e.g., g-for item/index) */
  scopeAdditions?: Record<string, unknown>;
  /** Pre-discovered directive names (render.ts passes these from indexTree) */
  directiveNames?: string[];
  /** Decode HTML entities in g-scope expressions (server mode) */
  decodeEntities?: boolean;
}

/**
 * Canonical preprocessing for an element before directive execution.
 *
 * @remarks
 * Handles scope creation, assigns, DI providers, element scope storage,
 * context creation, and g-scope evaluation. Returns null when the element
 * has nothing to process (no directives, no g-scope, no g-bind).
 *
 * g-bind:* is intentionally NOT processed here. Callers apply g-bind
 * after the directive loop, so directives that detach the element
 * (any priority level) naturally prevent stale bindings.
 *
 * @param el - The element to prepare
 * @param parentScope - Scope inherited from parent
 * @param mode - Execution mode
 * @param options - Configuration for scope source and directive discovery
 * @returns Preprocessing result, or null if nothing to process
 */
export function prepareElementScope(
  el: Element,
  parentScope: Record<string, unknown>,
  mode: Mode,
  options: PrepareOptions = {}
): PreparedElement | null {
  const { existingScope, scopeAdditions = {}, decodeEntities } = options;

  // 1. Directive discovery
  const directives = options.directiveNames
    ? [] as DirectiveMatch[]  // render.ts handles its own directive list
    : getDirectivesForElement(el);

  const hasScopeAttr = el.hasAttribute('g-scope');

  let hasBindAttrs = false;
  for (let i = 0; i < el.attributes.length; i++) {
    if (el.attributes[i].name.startsWith('g-bind:')) { hasBindAttrs = true; break; }
  }

  // 2. Quick exit — nothing to process
  if (directives.length === 0 && !options.directiveNames?.length && !hasScopeAttr && !hasBindAttrs) {
    return null;
  }

  // 3. Scope creation
  let scope: Record<string, unknown>;
  const hasScopeAdditions = Object.keys(scopeAdditions).length > 0;

  if (existingScope) {
    // Reuse existing scope (e.g., persistent scope from g-if toggle)
    scope = hasScopeAdditions
      ? createScope(existingScope, scopeAdditions)
      : existingScope;
  } else if (hasScopeAdditions) {
    // Create child scope with additions (e.g., g-for item/index)
    scope = createScope(parentScope, scopeAdditions);
  } else {
    // Lazy scope creation: only create if a directive needs it
    scope = parentScope;
    let directiveCreatedScope = false;

    // Use provided directiveNames or extract from matched directives
    const names = options.directiveNames
      ?? directives.map(d => d.fullName);

    for (const name of names) {
      if (!directiveCreatedScope && directiveNeedsScope(name)) {
        scope = createElementScope(el, scope);
        directiveCreatedScope = true;
      }

      // Register DI providers
      const registration = getDirective(name);
      if (registration?.options.provide) {
        registerDIProviders(el, registration.options.provide);
      }
    }

    // 4. Apply assigns
    if (directiveCreatedScope) {
      applyAssigns(scope, names);
    }
  }

  // 5. Set element scope
  setElementScope(el, scope);

  // 6. Context creation
  const ctx = createContext(mode, scope);

  // 7. g-scope attribute
  if (hasScopeAttr) {
    const scopeAttr = el.getAttribute('g-scope')!;
    const exprStr = decodeEntities
      ? decodeHTMLEntities(scopeAttr)
      : scopeAttr;
    const scopeValues = ctx.eval<Record<string, unknown>>(exprStr as Expression);
    if (scopeValues && typeof scopeValues === 'object') {
      Object.assign(scope, scopeValues);
    }
  }

  return { scope, ctx, directives };
}

/**
 * Apply g-bind:* attribute bindings on an element.
 *
 * @remarks
 * Must be called AFTER the directive loop. If a directive detached the
 * element (e.g., g-for removes and replaces with clones), the caller
 * skips this — the directive handles bindings on its clones via
 * processElementTree.
 *
 * In CLIENT mode, uses reactive effects. In SERVER mode, evaluates once.
 *
 * @param el - The element to apply bindings on
 * @param ctx - The evaluation context
 * @param mode - Execution mode
 */
export function applyElementBindings(el: Element, ctx: Context, mode: Mode): void {
  for (const [targetAttr, valueExpr] of getBindAttributes(el)) {
    const applyBinding = () => {
      const value = ctx.eval(valueExpr);
      applyBindValue(el, targetAttr, value);
    };

    if (mode === Mode.CLIENT) {
      effect(applyBinding);
    } else {
      applyBinding();
    }
  }
}

/**
 * Execute the directive loop for an element.
 *
 * @remarks
 * Processes directives in priority order (already sorted). After each
 * synchronous directive, checks if the element was detached from its parent.
 * If so, the loop breaks — the directive took ownership and lower-priority
 * directives run on whatever replacement the directive created (via
 * processElementTree).
 *
 * This makes the system agnostic about "structural" directives: any
 * directive at any priority that detaches the element naturally stops
 * the loop.
 *
 * @param el - The element being processed
 * @param scope - The element's scope
 * @param mode - Execution mode
 * @param ctx - The evaluation context
 * @param directives - Matched directives sorted by priority
 * @returns Whether the element was detached, and any async chain
 */
export function executeDirectiveLoop(
  el: Element,
  scope: Record<string, unknown>,
  mode: Mode,
  ctx: Context,
  directives: DirectiveMatch[]
): { detached: boolean; chain?: Promise<void> } {
  const parentBefore = el.parentNode;
  let detached = false;
  let chain: Promise<void> | undefined;

  for (const { directive, expr, options: opts } of directives) {
    const invoke = () => {
      const config = buildResolverConfig(el, scope, mode);
      const args = resolveDependencies(directive, expr, el, ctx.eval.bind(ctx), config, opts.using);
      const result = (directive as (...a: unknown[]) => void | Promise<void>)(...args);

      if (directive.$context?.length) {
        const state = getLocalState(el);
        registerProvider(el, directive, state);
      }

      return result;
    };

    if (chain instanceof Promise) {
      chain = chain.then(() => {
        const result = invoke();
        return result instanceof Promise ? result : undefined;
      });
    } else {
      const result = invoke();
      if (result instanceof Promise) {
        chain = result;
      }

      // If the directive detached the element, stop processing
      if (parentBefore && el.parentNode !== parentBefore) {
        detached = true;
        break;
      }
    }
  }

  return { detached, chain };
}

/**
 * Result from processDiscoveredElement.
 */
export interface ProcessElementResult {
  scope: Record<string, unknown>;
  detached: boolean;
  chain?: Promise<void>;
}

/**
 * Process a single element with full directive support via global registry.
 *
 * @remarks
 * The single processing path for all descendant elements in processElementTree.
 * Also used by hydrate.ts processElement for client-side processing.
 *
 * Handles native slots, g-scope, g-bind:*, ALL registered directives,
 * scope creation, DI resolution, provider registration, and element
 * detachment detection.
 *
 * g-bind:* attributes are applied after the directive loop. If a directive
 * detached the element (e.g., g-for removes and replaces with clones),
 * g-bind is skipped — the directive handles bindings on its replacements.
 *
 * @param el - The element to process
 * @param parentScope - The scope inherited from the parent element
 * @param mode - Execution mode
 * @returns Result with scope, detachment flag, and async chain; or null if skipped
 *
 * @internal
 */
export function processDiscoveredElement(
  el: Element,
  parentScope: Record<string, unknown>,
  mode: Mode
): ProcessElementResult | null {
  if (el.hasAttribute(PROCESSED_ATTR)) return null;
  if (el.hasAttribute(FOR_PROCESSED_ATTR)) return null;

  // Handle native <slot> elements
  if (el.tagName === 'SLOT') {
    processNativeSlot(el);
    return null;
  }

  // Handle template placeholders from SSR (g-if with false condition)
  if (el.tagName === 'TEMPLATE' && el.hasAttribute('data-g-if')) {
    const registration = getDirective('g-if');
    if (registration?.fn) {
      const ctx = createContext(mode, parentScope);
      const expr = el.getAttribute('data-g-if') || '';
      const config = buildResolverConfig(el, parentScope, mode);
      const args = resolveDependencies(
        registration.fn, expr, el, ctx.eval.bind(ctx), config, registration.options.using
      );
      (registration.fn as (...a: unknown[]) => void)(...args);
    }
    return { scope: parentScope, detached: true };
  }

  const prepared = prepareElementScope(el, parentScope, mode);
  if (!prepared) return null;

  el.setAttribute(PROCESSED_ATTR, '');

  const { scope, ctx, directives } = prepared;
  const { detached, chain } = executeDirectiveLoop(el, scope, mode, ctx, directives);

  // Apply g-bind:* only if the element wasn't detached by a directive
  if (!detached) {
    applyElementBindings(el, ctx, mode);
  }

  return { scope, detached, chain };
}

/**
 * Recursively process all directive-bearing descendants in a subtree.
 *
 * @remarks
 * Walks the tree depth-first, processing each element and recursing into
 * children. When a structural directive takes ownership of an element,
 * its descendants are skipped (the directive handles them internally via
 * its own processElementTree call).
 *
 * Scope is passed down through the recursion stack, avoiding DOM walking
 * via findParentScope on every element.
 *
 * @param root - The root element (already processed by setupRootScope)
 * @param parentScope - Scope to pass to child elements
 * @param mode - Execution mode
 *
 * @internal
 */
function processSubtree(
  root: Element,
  parentScope: Record<string, unknown>,
  mode: Mode
): void {
  const children = root.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (child.hasAttribute(PROCESSED_ATTR)) continue;
    if (child.hasAttribute(FOR_PROCESSED_ATTR)) continue;

    const result = processDiscoveredElement(child, parentScope, mode);

    if (!result?.detached && child.children.length > 0) {
      const childScope = result?.scope ?? getElementScope(child) ?? parentScope;
      processSubtree(child, childScope, mode);
    }
  }
}

/**
 * Set up the root element's scope from ProcessOptions.
 *
 * @remarks
 * Handles existingScope reuse and scopeAdditions for the root element only.
 * This is the only place ProcessOptions matter — descendants use
 * registry-based discovery via processSubtree.
 *
 * @internal
 */
function setupRootScope(
  el: Element,
  parentScope: Record<string, unknown>,
  mode: Mode,
  options: ProcessOptions
): Record<string, unknown> {
  el.setAttribute(PROCESSED_ATTR, '');

  const prepared = prepareElementScope(el, parentScope, mode, {
    existingScope: options.existingScope,
    scopeAdditions: options.scopeAdditions
  });

  if (!prepared) {
    // Even with no directives, root needs scope setup
    const { existingScope, scopeAdditions = {} } = options;
    const scope = existingScope
      ? (Object.keys(scopeAdditions).length > 0
          ? createScope(existingScope, scopeAdditions)
          : existingScope)
      : createScope(parentScope, scopeAdditions);
    setElementScope(el, scope);
    return scope;
  }

  const { scope, ctx, directives } = prepared;
  const { detached } = executeDirectiveLoop(el, scope, mode, ctx, directives);

  // Apply g-bind on root — root elements are clones from structural directives,
  // so they should always get bindings unless something unexpected detached them.
  if (!detached) {
    applyElementBindings(el, ctx, mode);
  }

  return scope;
}

/**
 * Process an element tree (element and all descendants).
 *
 * @remarks
 * Sets up the root element's scope (handling existingScope/scopeAdditions
 * from ProcessOptions), then discovers and processes ALL directive-bearing
 * descendants via {@link processSubtree} using the global directive registry.
 *
 * Uses the same processing path for both client and server modes.
 * The individual directives handle mode differences internally.
 *
 * @param el - The root element to process
 * @param parentScope - The parent scope
 * @param mode - Server or client mode
 * @param options - Processing options (existingScope only applies to root element)
 */
export function processElementTree(
  el: Element,
  parentScope: Record<string, unknown>,
  mode: Mode,
  options: ProcessOptions = {}
): void {
  const scope = setupRootScope(el, parentScope, mode, options);
  processSubtree(el, scope, mode);
}

