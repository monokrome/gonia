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
import { resolveContext } from '../context-registry.js';
import { SlotContentContext } from './template.js';

/**
 * Slot directive for content transclusion.
 *
 * @remarks
 * Finds the nearest template ancestor and transcludes the
 * matching slot content into itself. The SlotContentContext
 * is automatically injected via DI.
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
export const slot: Directive<['$expr', '$element', '$eval']> = function slot(
  $expr: Expression,
  $element: Element,
  $eval: EvalFn
) {
  const getName = (): string => {
    if ($expr && String($expr).trim()) {
      return String($eval($expr));
    }
    return $element.getAttribute('name') ?? 'default';
  };

  const transclude = () => {
    const name = getName();
    const content = resolveContext($element, SlotContentContext, true);

    if (!content) {
      return;
    }

    const slotContent = content.slots.get(name);

    if (slotContent) {
      $element.innerHTML = slotContent;
    }
  };

  if ($expr && String($expr).trim()) {
    effect(transclude);
  } else {
    transclude();
  }
};
slot.$inject = ['$expr', '$element', '$eval'];

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

  // Resolve slot content from nearest template ancestor
  const content = resolveContext(el, SlotContentContext);
  if (!content) {
    return;
  }

  const slotContent = content.slots.get(name);

  if (slotContent) {
    el.outerHTML = slotContent;
  }
}
