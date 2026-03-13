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
 * Evaluates the expression to get a `{ className: boolean }` object.
 * Classes with truthy values are added, falsy values are removed.
 * Static classes from the HTML are preserved.
 *
 * @example
 * ```html
 * <div g-class="{ active: isActive, 'text-red': hasError }">
 * <div g-class="{ [dynamicClass]: true }">
 * ```
 */
export const cclass: Directive<['$expr', '$element', '$eval']> = function cclass(
  $expr: Expression,
  $element: Element,
  $eval: EvalFn
) {
  effect(() => {
    const value = $eval<string | string[] | Record<string, boolean>>($expr);

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
        if (typeof item === 'string') {
          for (const name of item.split(/\s+/).filter(Boolean)) {
            $element.classList.add(name);
          }
        }
      }
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    for (const [className, shouldAdd] of Object.entries(value)) {
      if (shouldAdd) {
        $element.classList.add(className);
      } else {
        $element.classList.remove(className);
      }
    }
  });
};

cclass.$inject = ['$expr', '$element', '$eval'];

directive('g-class', cclass);
