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

import { Mode, Expression, Directive, DirectiveOptions, getDirective, DirectivePriority } from './types.js';
import { createContext } from './context.js';
import { createScope, effect } from './reactivity.js';
import { resolveDependencies } from './inject.js';
import { resolveContext, ContextKey } from './context-registry.js';
import { getLocalState, registerProvider, registerDIProviders, resolveFromProviders, resolveFromDIProviders } from './providers.js';
import { createElementScope, setElementScope, getElementScope } from './scope.js';
import { processNativeSlot } from './directives/slot.js';
import { applyAssigns, directiveNeedsScope } from './directive-utils.js';
import { getBindAttributes, applyBindValue } from './bind-utils.js';
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
    resolveContext: (key: ContextKey<unknown>) => resolveContext(el, key),
    resolveState: () => scope,
    resolveRootState: () => scope,
    resolveCustom: createCustomResolver(el, moduleServices),
    mode: mode === Mode.SERVER ? 'server' as const : 'client' as const
  };
}

/**
 * Process a single element with full directive support via global registry.
 *
 * @remarks
 * The single processing path for all descendant elements in processElementTree.
 * Handles native slots, g-scope, g-bind:*, ALL registered directives
 * (structural and non-structural), scope creation, DI resolution,
 * provider registration, and structural directive break.
 *
 * Works in both client mode (reactive effects) and server mode (one-shot eval).
 *
 * @param el - The element to process
 * @param parentScope - The scope inherited from the parent element
 * @param mode - Execution mode
 * @returns true if a structural directive took ownership (caller should skip descendants)
 *
 * @internal
 */
function processDiscoveredElement(
  el: Element,
  parentScope: Record<string, unknown>,
  mode: Mode
): boolean {
  if (el.hasAttribute(PROCESSED_ATTR)) return false;
  if (el.hasAttribute(FOR_PROCESSED_ATTR)) return false;

  // Handle native <slot> elements
  if (el.tagName === 'SLOT') {
    processNativeSlot(el);
    return false;
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
    return true;
  }

  const directives = getDirectivesForElement(el);
  const hasScopeAttr = el.hasAttribute('g-scope');

  let hasBindAttrs = false;
  for (let i = 0; i < el.attributes.length; i++) {
    if (el.attributes[i].name.startsWith('g-bind:')) { hasBindAttrs = true; break; }
  }

  if (directives.length === 0 && !hasScopeAttr && !hasBindAttrs) return false;

  el.setAttribute(PROCESSED_ATTR, '');

  let scope = parentScope;
  let directiveCreatedScope = false;
  let hitStructural = false;

  const directiveNames: string[] = [];

  for (const { fullName, options: opts } of directives) {
    directiveNames.push(fullName);

    if (!directiveCreatedScope && directiveNeedsScope(fullName)) {
      scope = createElementScope(el, scope);
      directiveCreatedScope = true;
    }

    if (opts.provide) {
      registerDIProviders(el, opts.provide);
    }
  }

  if (directiveCreatedScope) {
    applyAssigns(scope, directiveNames);
  }

  setElementScope(el, scope);

  const ctx = createContext(mode, scope);

  // Process g-scope (inline scope initialization)
  if (hasScopeAttr) {
    const scopeAttr = el.getAttribute('g-scope')!;
    const scopeValues = ctx.eval<Record<string, unknown>>(scopeAttr as Expression);
    if (scopeValues && typeof scopeValues === 'object') {
      Object.assign(scope, scopeValues);
    }
  }

  // Process g-bind:* attributes
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

  // Process directives sequentially
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

    const isStructural = directive.priority === DirectivePriority.STRUCTURAL;

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
    }

    if (isStructural) {
      hitStructural = true;
      break;
    }
  }

  return hitStructural;
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

    const wasStructural = processDiscoveredElement(child, parentScope, mode);

    if (!wasStructural && child.children.length > 0) {
      const childScope = getElementScope(child) ?? parentScope;
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
  const { existingScope, scopeAdditions = {} } = options;

  el.setAttribute(PROCESSED_ATTR, '');

  const scope = existingScope
    ? (Object.keys(scopeAdditions).length > 0
        ? createScope(existingScope, scopeAdditions)
        : existingScope)
    : createScope(parentScope, scopeAdditions);

  setElementScope(el, scope);

  const ctx = createContext(mode, scope);

  // Process g-scope (inline scope initialization)
  const scopeAttr = el.getAttribute('g-scope');
  if (scopeAttr) {
    const scopeValues = ctx.eval<Record<string, unknown>>(scopeAttr as Expression);
    if (scopeValues && typeof scopeValues === 'object') {
      Object.assign(scope, scopeValues);
    }
  }

  // Process g-bind:* on root
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

  // Process root element's own directives via the registry
  const directives = getDirectivesForElement(el);
  for (const { directive, expr, options: opts } of directives) {
    const config = buildResolverConfig(el, scope, mode);
    const args = resolveDependencies(directive, expr, el, ctx.eval.bind(ctx), config, opts.using);
    (directive as (...a: unknown[]) => void | Promise<void>)(...args);

    if (directive.$context?.length) {
      const state = getLocalState(el);
      registerProvider(el, directive, state);
    }
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

/**
 * Process directives on a single element (root scope setup only).
 *
 * @remarks
 * Handles scope creation with existingScope/scopeAdditions and processes
 * the hardcoded built-in directives on the element itself. Does NOT process
 * descendants — use {@link processElementTree} for that.
 *
 * @deprecated Prefer {@link processElementTree} which uses unified registry-based
 * processing for all elements. This function exists for backwards compatibility
 * with tests that call it directly on individual elements.
 *
 * @param el - The element to process
 * @param parentScope - The parent scope for variable resolution
 * @param mode - Server or client mode
 * @param options - Processing options
 * @returns The scope used for this element
 */
export function processElementDirectives(
  el: Element,
  parentScope: Record<string, unknown>,
  mode: Mode,
  options: ProcessOptions = {}
): Record<string, unknown> {
  const { existingScope, scopeAdditions = {} } = options;

  el.setAttribute(PROCESSED_ATTR, '');

  const scope = existingScope
    ? (Object.keys(scopeAdditions).length > 0
        ? createScope(existingScope, scopeAdditions)
        : existingScope)
    : createScope(parentScope, scopeAdditions);

  setElementScope(el, scope);

  const ctx = createContext(mode, scope);

  // Process g-scope (inline scope initialization)
  const scopeAttr = el.getAttribute('g-scope');
  if (scopeAttr) {
    const scopeValues = ctx.eval<Record<string, unknown>>(scopeAttr as Expression);
    if (scopeValues && typeof scopeValues === 'object') {
      Object.assign(scope, scopeValues);
    }
  }

  // Process g-text
  const textAttr = el.getAttribute('g-text');
  if (textAttr) {
    if (mode === Mode.CLIENT) {
      effect(() => {
        const value = ctx.eval(textAttr as Expression);
        el.textContent = String(value ?? '');
      });
    } else {
      const value = ctx.eval(textAttr as Expression);
      el.textContent = String(value ?? '');
    }
  }

  // Process g-class
  const classAttr = el.getAttribute('g-class');
  if (classAttr) {
    const applyClasses = () => {
      const classObj = ctx.eval<Record<string, boolean>>(classAttr as Expression);
      if (classObj && typeof classObj === 'object') {
        for (const [className, shouldAdd] of Object.entries(classObj)) {
          if (shouldAdd) {
            el.classList.add(className);
          } else {
            el.classList.remove(className);
          }
        }
      }
    };

    if (mode === Mode.CLIENT) {
      effect(applyClasses);
    } else {
      applyClasses();
    }
  }

  // Process g-show
  const showAttr = el.getAttribute('g-show');
  if (showAttr) {
    const applyShow = () => {
      const value = ctx.eval(showAttr as Expression);
      (el as HTMLElement).style.display = value ? '' : 'none';
    };

    if (mode === Mode.CLIENT) {
      effect(applyShow);
    } else {
      applyShow();
    }
  }

  // Process g-on (client only)
  if (mode === Mode.CLIENT) {
    const onAttr = el.getAttribute('g-on');
    if (onAttr) {
      const colonIdx = onAttr.indexOf(':');
      if (colonIdx !== -1) {
        const eventName = onAttr.slice(0, colonIdx).trim();
        const handlerExpr = onAttr.slice(colonIdx + 1).trim();
        el.addEventListener(eventName, (event: Event) => {
          const result = ctx.eval(handlerExpr as Expression);
          if (typeof result === 'function') {
            result.call(scope, event);
          }
        });
      }
    }
  }

  // Process g-model (client only)
  if (mode === Mode.CLIENT) {
    const modelAttr = el.getAttribute('g-model');
    if (modelAttr) {
      const registration = getDirective('g-model');
      if (registration?.fn) {
        const config = buildResolverConfig(el, scope, mode);
        const args = resolveDependencies(
          registration.fn, modelAttr, el, ctx.eval.bind(ctx), config, registration.options.using
        );
        registration.fn(...args);
      }
    }
  }

  // Process g-html
  const htmlAttr = el.getAttribute('g-html');
  if (htmlAttr) {
    const applyHtml = () => {
      const value = ctx.eval(htmlAttr as Expression);
      el.innerHTML = String(value ?? '');
    };

    if (mode === Mode.CLIENT) {
      effect(applyHtml);
    } else {
      applyHtml();
    }
  }

  // Process g-bind:*
  for (const attr of [...el.attributes].filter(a => a.name.startsWith('g-bind:'))) {
    const targetAttr = attr.name.slice('g-bind:'.length);
    const valueExpr = attr.value as Expression;

    const applyBinding = () => {
      const value = ctx.eval(valueExpr);
      if (value === null || value === undefined) {
        el.removeAttribute(targetAttr);
      } else {
        el.setAttribute(targetAttr, String(value));
      }
    };

    if (mode === Mode.CLIENT) {
      effect(applyBinding);
    } else {
      applyBinding();
    }
  }

  return scope;
}
