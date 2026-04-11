/**
 * Dynamic class binding directive.
 *
 * @packageDocumentation
 */

import { directive, Directive, Expression, EvalFn } from '../types.js';
import { effect } from '../reactivity.js';

/**
 * Bind classes dynamically based on an expression.
 *
 * @remarks
 * Supported value shapes:
 *
 * - **String** `'a b'` — unconditional adds. The named classes are
 *   added. These entries are never removed on re-evaluation.
 * - **Object** `{ name: boolean }` — toggled entries. Each key is
 *   added when its value is truthy and removed when falsy. Re-runs
 *   update every listed key based on the fresh condition.
 * - **Array** — a mix of the above. Each item is handled according
 *   to its own shape, so `[$styles.root, { [$styles.open]: isOpen }]`
 *   keeps `root` stamped and toggles `open`.
 *
 * Static classes from the HTML and classes managed by other
 * directives are untouched — the effect only adds or removes names
 * it was told about by the current expression.
 *
 * @example
 * ```html
 * <div g-class="{ active: isActive, 'text-red': hasError }">
 * <div g-class="[$styles.root, { [$styles.open]: isOpen }]">
 * <div g-class="'static-only'">
 * ```
 */
export const cclass: Directive<['$expr', '$element', '$eval']> = function cclass(
  $expr: Expression,
  $element: Element,
  $eval: EvalFn
) {
  effect(() => {
    const value =
      $eval<string | Array<string | Record<string, unknown>> | Record<string, unknown>>($expr);
    applyClassValue($element, value);
  });
};

/**
 * Recursively apply a g-class value to an element's classList.
 *
 * @remarks
 * Strings are unconditional adds. Objects toggle each key by the
 * truthiness of its value (add when truthy, remove when falsy).
 * Arrays are walked in order and each item is handled according
 * to its own shape.
 *
 * @internal
 */
function applyClassValue($element: Element, value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    for (const name of value.split(/\s+/).filter(Boolean)) {
      $element.classList.add(name);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      applyClassValue($element, item);
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  for (const [className, shouldAdd] of Object.entries(value as Record<string, unknown>)) {
    if (shouldAdd) {
      $element.classList.add(className);
    } else {
      $element.classList.remove(className);
    }
  }
}

cclass.$inject = ['$expr', '$element', '$eval'];

directive('g-class', cclass);
