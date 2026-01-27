/**
 * Conditional rendering directive.
 *
 * @packageDocumentation
 */

import { directive, Directive, DirectivePriority, Expression, EvalFn, Mode } from '../types.js';
import { effect, createScope } from '../reactivity.js';
import { processElementTree, PROCESSED_ATTR } from '../process.js';

/** Attribute used to mark elements processed by g-if */
export const IF_PROCESSED_ATTR = 'data-g-if-processed';

/** WeakMap to store persistent scopes for g-if placeholders */
const placeholderScopes = new WeakMap<Element, Record<string, unknown>>();

/**
 * Get or create a persistent scope for a g-if placeholder.
 *
 * @remarks
 * The scope is anchored to the placeholder element, not the rendered content.
 * This allows state to persist across condition toggles.
 *
 * @param placeholder - The template placeholder element
 * @param parentState - The parent scope to inherit from
 * @returns The persistent scope for this g-if block
 */
function getOrCreateScope(
  placeholder: Element,
  parentState: Record<string, unknown>
): Record<string, unknown> {
  let scope = placeholderScopes.get(placeholder);
  if (!scope) {
    scope = createScope(parentState, {});
    placeholderScopes.set(placeholder, scope);
  }
  return scope;
}

/**
 * Conditionally render an element.
 *
 * @remarks
 * Unlike g-show which uses display:none, g-if completely removes
 * the element from the DOM when the condition is falsy.
 *
 * State within the conditional block is preserved across toggles.
 * The scope is anchored to the placeholder, not the rendered element.
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
export const cif: Directive<['$expr', '$element', '$eval', '$scope', '$mode']> = function cif(
  $expr: Expression,
  $element: Element,
  $eval: EvalFn,
  $scope: Record<string, unknown>,
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
      $element.setAttribute(IF_PROCESSED_ATTR, '');
      processElementTree($element, $scope, $mode);
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

  // Create persistent scope anchored to the placeholder
  const persistentScope = getOrCreateScope(placeholder, $scope);

  let renderedElement: Element | null = null;

  effect(() => {
    const condition = $eval($expr);

    if (condition) {
      if (!renderedElement) {
        renderedElement = template.cloneNode(true) as Element;
        renderedElement.setAttribute(IF_PROCESSED_ATTR, '');

        // Process with the persistent scope - state survives across toggles
        processElementTree(renderedElement, $scope, Mode.CLIENT, {
          existingScope: persistentScope
        });

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
        // Scope survives in persistentScope - ready for next render
      }
    }
  });
};

cif.$inject = ['$expr', '$element', '$eval', '$scope', '$mode'];
cif.priority = DirectivePriority.STRUCTURAL;

directive('g-if', cif);
