/**
 * Shared template utilities for client and server.
 *
 * @packageDocumentation
 */

import { TemplateAttrs } from './types.js';

/**
 * Extract template attributes from an element.
 *
 * @param el - The element to extract attributes from
 * @returns An object with all attributes and children innerHTML
 */
export function getTemplateAttrs(el: Element): TemplateAttrs {
  const attrs: TemplateAttrs = {
    children: el.innerHTML
  };

  for (const attr of el.attributes) {
    attrs[attr.name] = attr.value;
  }

  return attrs;
}

/**
 * Check if element has any g-bind:* attributes.
 *
 * @param el - The element to check
 * @returns True if element has g-bind attributes
 */
export function hasBindAttributes(el: Element): boolean {
  for (const attr of el.attributes) {
    if (attr.name.startsWith('g-bind:')) {
      return true;
    }
  }
  return false;
}

/**
 * Decode HTML entities that happy-dom doesn't decode.
 * Only needed for server-side rendering.
 *
 * @param str - The string with HTML entities
 * @returns The decoded string
 */
export function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
