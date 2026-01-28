/**
 * Shared g-bind attribute processing utilities.
 *
 * @packageDocumentation
 */

import { Expression, Context } from './types.js';
import { decodeHTMLEntities } from './template-utils.js';

/**
 * Apply a single g-bind attribute value to an element.
 *
 * @param el - The element to update
 * @param targetAttr - The attribute name to set (without g-bind: prefix)
 * @param value - The evaluated value
 */
export function applyBindValue(el: Element, targetAttr: string, value: unknown): void {
  if (value === null || value === undefined) {
    el.removeAttribute(targetAttr);
  } else {
    el.setAttribute(targetAttr, String(value));
  }
}

/**
 * Process all g-bind:* attributes on an element.
 * For server-side rendering (one-time evaluation).
 *
 * @param el - The element to process
 * @param ctx - The context for expression evaluation
 * @param decode - Whether to decode HTML entities (for server-side)
 */
export function processBindAttributesOnce(
  el: Element,
  ctx: Context,
  decode: boolean = false
): void {
  for (const attr of [...el.attributes]) {
    if (attr.name.startsWith('g-bind:')) {
      const targetAttr = attr.name.slice('g-bind:'.length);
      const expr = decode ? decodeHTMLEntities(attr.value) : attr.value;
      const value = ctx.eval(expr as Expression);
      applyBindValue(el, targetAttr, value);
    }
  }
}

/**
 * Get all g-bind attributes from an element.
 * Used by client to set up reactive bindings.
 *
 * @param el - The element to get bindings from
 * @returns Array of [targetAttr, expression] pairs
 */
export function getBindAttributes(el: Element): Array<[string, Expression]> {
  const bindings: Array<[string, Expression]> = [];
  for (const attr of el.attributes) {
    if (attr.name.startsWith('g-bind:')) {
      const targetAttr = attr.name.slice('g-bind:'.length);
      bindings.push([targetAttr, attr.value as Expression]);
    }
  }
  return bindings;
}
