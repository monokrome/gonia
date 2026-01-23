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
 * <div c-class="{ active: isActive, 'text-red': hasError }">
 * <div c-class="{ [dynamicClass]: true }">
 * ```
 */
export const cclass: Directive<['$expr', '$element', '$eval']> = function cclass(
  $expr: Expression,
  $element: Element,
  $eval: EvalFn
) {
  effect(() => {
    const classObj = $eval<Record<string, boolean>>($expr);

    if (classObj === null || classObj === undefined) {
      return;
    }

    if (typeof classObj !== 'object') {
      return;
    }

    for (const [className, shouldAdd] of Object.entries(classObj)) {
      if (shouldAdd) {
        $element.classList.add(className);
      } else {
        $element.classList.remove(className);
      }
    }
  });
};

cclass.$inject = ['$expr', '$element', '$eval'];

directive('c-class', cclass);
