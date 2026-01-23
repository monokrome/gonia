/**
 * Event handling directive.
 *
 * @packageDocumentation
 */

import { directive, Directive, Expression, EvalFn } from '../types.js';

/**
 * Parse g-on expression: "event: handler" or "event: handler()"
 */
function parseOnExpression(expr: string): { event: string; handler: string } | null {
  const colonIdx = expr.indexOf(':');
  if (colonIdx === -1) {
    return null;
  }

  const event = expr.slice(0, colonIdx).trim();
  const handler = expr.slice(colonIdx + 1).trim();

  if (!event || !handler) {
    return null;
  }

  return { event, handler };
}

/**
 * Bind event handler to element.
 *
 * @remarks
 * The handler receives the event object and can call preventDefault(),
 * stopPropagation(), etc. as needed.
 *
 * @example
 * ```html
 * <button g-on="click: handleClick">Click me</button>
 * <form g-on="submit: save">
 * <input g-on="keydown: onKey">
 * ```
 */
export const on: Directive<['$expr', '$element', '$eval', '$rootState']> = function on(
  $expr: Expression,
  $element: Element,
  $eval: EvalFn,
  $rootState: Record<string, unknown>
) {
  const parsed = parseOnExpression($expr as string);
  if (!parsed) {
    console.error(`Invalid g-on expression: ${$expr}. Expected "event: handler"`);
    return;
  }

  const { event: eventName, handler: handlerExpr } = parsed;

  const handler = (event: Event) => {
    // Evaluate the expression. If it returns a function (e.g., "addTodo" instead
    // of "addTodo()"), call it with the state as 'this' context and event as arg.
    const result = $eval(handlerExpr as Expression);
    if (typeof result === 'function') {
      result.call($rootState, event);
    }
  };

  $element.addEventListener(eventName, handler);
};

on.$inject = ['$expr', '$element', '$eval', '$rootState'];

directive('g-on', on);
