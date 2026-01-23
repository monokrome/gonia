import { directive, Directive, Expression, EvalFn } from '../types.js';

/**
 * Toggle element visibility based on an expression.
 *
 * @remarks
 * Sets `display: none` when the expression is falsy,
 * removes inline display style when truthy.
 *
 * @example
 * ```html
 * <div c-show="isVisible">Visible content</div>
 * <div c-show="items.length > 0">Has items</div>
 * ```
 */
export const show: Directive<['$expr', '$element', '$eval']> = function show($expr: Expression, $element: Element, $eval: EvalFn) {
  const value = $eval($expr);
  ($element as HTMLElement).style.display = value ? '' : 'none';
};

directive('c-show', show);
