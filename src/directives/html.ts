import { directive, Directive, Expression, EvalFn } from '../types.js';

/**
 * Set element's innerHTML from an expression.
 *
 * @remarks
 * Evaluates the expression and sets the element's `innerHTML`.
 *
 * @warning Only use with trusted content. User input can lead to XSS attacks.
 *
 * @example
 * ```html
 * <div c-html="formattedContent"></div>
 * <div c-html="'<strong>' + title + '</strong>'"></div>
 * ```
 */
export const html: Directive<['$expr', '$element', '$eval']> = function html($expr: Expression, $element: Element, $eval: EvalFn) {
  $element.innerHTML = String($eval($expr) ?? '');
};

directive('c-html', html);
