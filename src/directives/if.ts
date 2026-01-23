/**
 * Conditional rendering directive.
 *
 * @packageDocumentation
 */

import { directive, Directive, DirectivePriority, Expression, EvalFn, Mode } from '../types.js';
import { effect } from '../reactivity.js';
import { createContext } from '../context.js';
import { createScope } from '../reactivity.js';

/** Attribute used to mark elements processed by c-if */
export const IF_PROCESSED_ATTR = 'data-c-if-processed';

/**
 * Process directives on a conditionally rendered element.
 */
function processConditionalElement(
  el: Element,
  parentState: Record<string, unknown>,
  mode: Mode
): void {
  el.setAttribute(IF_PROCESSED_ATTR, '');

  const childScope = createScope(parentState, {});
  const childCtx = createContext(mode, childScope);

  // Process c-text directives
  const textAttr = el.getAttribute('c-text');
  if (textAttr) {
    const value = childCtx.eval(textAttr as Expression);
    el.textContent = String(value ?? '');
  }

  // Process c-class directives
  const classAttr = el.getAttribute('c-class');
  if (classAttr) {
    const classObj = childCtx.eval<Record<string, boolean>>(classAttr as Expression);
    if (classObj && typeof classObj === 'object') {
      for (const [className, shouldAdd] of Object.entries(classObj)) {
        if (shouldAdd) {
          el.classList.add(className);
        } else {
          el.classList.remove(className);
        }
      }
    }
  }

  // Process c-show directives
  const showAttr = el.getAttribute('c-show');
  if (showAttr) {
    const value = childCtx.eval(showAttr as Expression);
    (el as HTMLElement).style.display = value ? '' : 'none';
  }

  // Process c-on directives (format: "event: handler") - client only
  if (mode === Mode.CLIENT) {
    const onAttr = el.getAttribute('c-on');
    if (onAttr) {
      const colonIdx = onAttr.indexOf(':');
      if (colonIdx !== -1) {
        const eventName = onAttr.slice(0, colonIdx).trim();
        const handlerExpr = onAttr.slice(colonIdx + 1).trim();

        el.addEventListener(eventName, (event: Event) => {
          const result = childCtx.eval(handlerExpr as Expression);
          if (typeof result === 'function') {
            result.call(childScope, event);
          }
        });
      }
    }
  }

  // Process children recursively
  for (const child of el.children) {
    processConditionalElement(child, childScope, mode);
  }
}

/**
 * Conditionally render an element.
 *
 * @remarks
 * Unlike c-show which uses display:none, c-if completely removes
 * the element from the DOM when the condition is falsy.
 *
 * On server: evaluates once and removes element if false.
 * On client: sets up reactive effect to toggle element.
 *
 * @example
 * ```html
 * <div c-if="isLoggedIn">Welcome back!</div>
 * <div c-if="items.length > 0">Has items</div>
 * ```
 */
export const cif: Directive<['$expr', '$element', '$eval', '$state', '$mode']> = function cif(
  $expr: Expression,
  $element: Element,
  $eval: EvalFn,
  $state: Record<string, unknown>,
  $mode: Mode
) {
  const parent = $element.parentNode;
  if (!parent) {
    return;
  }

  // Server-side: evaluate once and remove if false
  if ($mode === Mode.SERVER) {
    const condition = $eval($expr);
    if (!condition) {
      $element.remove();
    } else {
      // Process child directives
      $element.removeAttribute('c-if');
      processConditionalElement($element, $state, $mode);
    }
    return;
  }

  // Client-side: set up reactive effect
  const placeholder = $element.ownerDocument.createComment(` c-if: ${$expr} `);
  parent.insertBefore(placeholder, $element);

  const template = $element.cloneNode(true) as Element;
  template.removeAttribute('c-if');
  $element.remove();

  let renderedElement: Element | null = null;

  effect(() => {
    const condition = $eval($expr);

    if (condition) {
      if (!renderedElement) {
        renderedElement = template.cloneNode(true) as Element;
        processConditionalElement(renderedElement, $state, Mode.CLIENT);

        if (placeholder.nextSibling) {
          parent.insertBefore(renderedElement, placeholder.nextSibling);
        } else {
          parent.appendChild(renderedElement);
        }
      }
    } else {
      if (renderedElement) {
        renderedElement.remove();
        renderedElement = null;
      }
    }
  });
};

cif.$inject = ['$expr', '$element', '$eval', '$state', '$mode'];
cif.priority = DirectivePriority.STRUCTURAL;

directive('c-if', cif);
