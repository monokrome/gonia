/**
 * Conditional rendering directive.
 *
 * @packageDocumentation
 */

import { directive, Directive, DirectivePriority, Expression, EvalFn, Mode } from '../types.js';
import { effect } from '../reactivity.js';
import { createContext } from '../context.js';
import { createScope } from '../reactivity.js';

/** Attribute used to mark elements processed by g-if */
export const IF_PROCESSED_ATTR = 'data-g-if-processed';

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

  // Process g-text directives
  const textAttr = el.getAttribute('g-text');
  if (textAttr) {
    const value = childCtx.eval(textAttr as Expression);
    el.textContent = String(value ?? '');
  }

  // Process g-class directives
  const classAttr = el.getAttribute('g-class');
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

  // Process g-show directives
  const showAttr = el.getAttribute('g-show');
  if (showAttr) {
    const value = childCtx.eval(showAttr as Expression);
    (el as HTMLElement).style.display = value ? '' : 'none';
  }

  // Process g-on directives (format: "event: handler") - client only
  if (mode === Mode.CLIENT) {
    const onAttr = el.getAttribute('g-on');
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
 * Unlike g-show which uses display:none, g-if completely removes
 * the element from the DOM when the condition is falsy.
 *
 * On server: evaluates once and removes element if false.
 * On client: sets up reactive effect to toggle element.
 *
 * @example
 * ```html
 * <div g-if="isLoggedIn">Welcome back!</div>
 * <div g-if="items.length > 0">Has items</div>
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

  // Server-side: evaluate once and leave template placeholder if false
  if ($mode === Mode.SERVER) {
    const condition = $eval($expr);
    if (!condition) {
      // Leave a template marker so client hydration knows where to insert
      const placeholder = $element.ownerDocument.createElement('template');
      placeholder.setAttribute('data-g-if', String($expr));
      // Store original element inside template for hydration
      placeholder.innerHTML = $element.outerHTML;
      parent.insertBefore(placeholder, $element);
      $element.remove();
    } else {
      // Process child directives
      $element.removeAttribute('g-if');
      processConditionalElement($element, $state, $mode);
    }
    return;
  }

  // Client-side: check if this is a template placeholder (from SSR)
  const isTemplatePlaceholder = $element.tagName === 'TEMPLATE' && $element.hasAttribute('data-g-if');

  let placeholder: Element;
  let template: Element;

  if (isTemplatePlaceholder) {
    // Hydrating SSR output - template is the placeholder, content is inside
    placeholder = $element;
    const content = ($element as HTMLTemplateElement).content.firstElementChild
      || ($element as HTMLTemplateElement).innerHTML;
    if (typeof content === 'string') {
      const temp = $element.ownerDocument.createElement('div');
      temp.innerHTML = content;
      template = temp.firstElementChild!;
    } else {
      template = content.cloneNode(true) as Element;
    }
    template.removeAttribute('g-if');
  } else {
    // Pure client-side - create template placeholder
    placeholder = $element.ownerDocument.createElement('template');
    placeholder.setAttribute('data-g-if', String($expr));
    parent.insertBefore(placeholder, $element);
    template = $element.cloneNode(true) as Element;
    template.removeAttribute('g-if');
    $element.remove();
  }

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

directive('g-if', cif);
