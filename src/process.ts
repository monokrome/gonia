/**
 * Shared element processing for structural directives.
 *
 * @remarks
 * Provides a unified way to process directives on elements created by
 * structural directives like g-if and g-for. Supports scope reuse for
 * state preservation across re-renders.
 *
 * @packageDocumentation
 */

import { Mode, Expression, getDirective, getDirectiveNames, DirectivePriority } from './types.js';
import { createContext } from './context.js';
import { createScope, effect } from './reactivity.js';
import { resolveDependencies } from './inject.js';
import { resolveContext, ContextKey } from './context-registry.js';
import { getLocalState, registerProvider, resolveFromProviders, resolveFromDIProviders } from './providers.js';

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

/**
 * Create resolver config for dependency resolution.
 *
 * @internal
 */
function createResolverConfig(el: Element, scope: Record<string, unknown>, mode: Mode) {
  return {
    resolveContext: (key: ContextKey<unknown>) => resolveContext(el, key),
    resolveState: () => scope,
    resolveRootState: () => scope,
    resolveCustom: (name: string) => {
      const diProvided = resolveFromDIProviders(el, name);
      if (diProvided !== undefined) return diProvided;
      return resolveFromProviders(el, name);
    },
    mode: mode === Mode.SERVER ? 'server' as const : 'client' as const
  };
}

/**
 * Set up an event handler on an element.
 *
 * @internal
 */
function setupEventHandler(
  el: Element,
  expr: string,
  ctx: { eval: (expr: Expression) => unknown },
  scope: Record<string, unknown>
): void {
  const colonIdx = expr.indexOf(':');
  if (colonIdx === -1) {
    return;
  }

  const eventName = expr.slice(0, colonIdx).trim();
  const handlerExpr = expr.slice(colonIdx + 1).trim();

  el.addEventListener(eventName, (event: Event) => {
    const result = ctx.eval(handlerExpr as Expression);
    if (typeof result === 'function') {
      result.call(scope, event);
    }
  });
}

/**
 * Process directives on an element using registered directives.
 *
 * @remarks
 * This processes all non-structural directives (g-text, g-class, g-show, g-on, etc.)
 * on an element. For structural directives, use the directives directly.
 *
 * @param el - The element to process
 * @param parentScope - The parent scope for variable resolution
 * @param mode - Server or client mode
 * @param options - Processing options
 * @returns The scope used for this element (for chaining/children)
 */
export function processElementDirectives(
  el: Element,
  parentScope: Record<string, unknown>,
  mode: Mode,
  options: ProcessOptions = {}
): Record<string, unknown> {
  const { existingScope, scopeAdditions = {}, skipStructural = true } = options;

  // Mark element as processed
  el.setAttribute(PROCESSED_ATTR, '');

  // Use existing scope or create a new child scope
  const scope = existingScope
    ? (Object.keys(scopeAdditions).length > 0
        ? createScope(existingScope, scopeAdditions)
        : existingScope)
    : createScope(parentScope, scopeAdditions);

  const ctx = createContext(mode, scope);

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
      setupEventHandler(el, onAttr, ctx, scope);
    }
  }

  // Process g-model (client only)
  if (mode === Mode.CLIENT) {
    const modelAttr = el.getAttribute('g-model');
    if (modelAttr) {
      const registration = getDirective('g-model');
      if (registration?.fn) {
        const config = createResolverConfig(el, scope, mode);
        const args = resolveDependencies(
          registration.fn,
          modelAttr,
          el,
          ctx.eval.bind(ctx),
          config,
          registration.options.using
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

  return scope;
}

/**
 * Process an element tree (element and all descendants).
 *
 * @remarks
 * Recursively processes directives on an element and all its children.
 * Each child gets its own scope that inherits from the parent.
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
  // Process the root element
  const scope = processElementDirectives(el, parentScope, mode, options);

  // Process children recursively (they get fresh child scopes)
  for (const child of el.children) {
    processElementTree(child, scope, mode, { skipStructural: true });
  }
}
