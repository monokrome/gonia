import { directive, Directive, Expression, EvalFn } from '../types.js';

/**
 * Set element's text content from an expression.
 *
 * @remarks
 * Evaluates the expression and sets the element's `textContent`.
 * Safe from XSS as it doesn't interpret HTML.
 *
 * @example
 * ```html
 * <span c-text="user.name"></span>
 * <span c-text="'Hello, ' + user.name + '!'"></span>
 * ```
 */
export const text: Directive<['$expr', '$element', '$eval']> = function text($expr: Expression, $element: Element, $eval: EvalFn) {
  $element.textContent = String($eval($expr) ?? '');
};

directive('c-text', text);
