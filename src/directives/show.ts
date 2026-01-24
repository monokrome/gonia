import { directive, Directive, Expression, EvalFn } from '../types.js';
import { effect } from '../reactivity.js';

/**
 * Toggle element visibility based on an expression.
 *
 * @remarks
 * Sets `display: none` when the expression is falsy,
 * removes inline display style when truthy.
 *
 * @example
 * ```html
 * <div g-show="isVisible">Visible content</div>
 * <div g-show="items.length > 0">Has items</div>
 * ```
 */
export const show: Directive<['$expr', '$element', '$eval']> = function show($expr: Expression, $element: Element, $eval: EvalFn) {
  effect(() => {
    const value = $eval($expr);
    ($element as HTMLElement).style.display = value ? '' : 'none';
  });
};

directive('g-show', show);
