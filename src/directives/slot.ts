/**
 * Slot directive for content transclusion.
 *
 * @remarks
 * A slot is a placeholder in a template that receives content
 * from the element using the template. Slots enable composition
 * by allowing parent content to be projected into child templates.
 *
 * @packageDocumentation
 */

import { directive, Directive, Expression, EvalFn } from '../types.js';
import { effect } from '../reactivity.js';
import { findTemplateAncestor, getSavedContent } from './template.js';

/**
 * Slot directive for content transclusion.
 *
 * @remarks
 * Finds the nearest template ancestor and transcludes the
 * matching slot content into itself.
 *
 * If the slot name is an expression, wraps in an effect
 * for reactivity.
 *
 * @example
 * Static slot name:
 * ```html
 * <slot name="header"></slot>
 * ```
 *
 * Dynamic slot name:
 * ```html
 * <slot g-slot="activeTab"></slot>
 * ```
 *
 * Default slot (no name):
 * ```html
 * <slot></slot>
 * ```
 */
export const slot: Directive<['$expr', '$element', '$eval']> = function slot($expr: Expression, $element: Element, $eval: EvalFn) {
  // Determine slot name
  // If expr is empty, check for name attribute, otherwise use 'default'
  const getName = (): string => {
    if ($expr && String($expr).trim()) {
      // Dynamic slot name from expression
      return String($eval($expr));
    }
    // Static slot name from attribute or default
    return $element.getAttribute('name') ?? 'default';
  };

  const transclude = () => {
    const name = getName();
    const templateEl = findTemplateAncestor($element);

    if (!templateEl) {
      // No template ancestor - leave slot as-is or clear it
      return;
    }

    const content = getSavedContent(templateEl)!;
    const slotContent = content.slots.get(name);

    if (slotContent) {
      $element.innerHTML = slotContent;
      // MutationObserver will process the new content
    } else {
      // No content for this slot - could show fallback
      // For now, leave any default content in the slot
    }
  };

  // If expression is provided, make it reactive
  if ($expr && String($expr).trim()) {
    effect(transclude);
  } else {
    // Static slot name - just run once
    transclude();
  }
};

directive('g-slot', slot);

/**
 * Process native <slot> elements.
 *
 * @remarks
 * This handles native `<slot>` elements in templates,
 * treating them the same as `g-slot` directives.
 *
 * @internal
 */
export function processNativeSlot(el: Element): void {
  const name = el.getAttribute('name') ?? 'default';
  const templateEl = findTemplateAncestor(el);

  if (!templateEl) {
    return;
  }

  const content = getSavedContent(templateEl)!;
  const slotContent = content.slots.get(name);

  if (slotContent) {
    el.outerHTML = slotContent;
  }
}
