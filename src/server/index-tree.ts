/**
 * DOM tree indexing for server-side directive discovery.
 *
 * @packageDocumentation
 */

import { Expression, DirectivePriority, Directive, getDirective, getDirectiveNames } from '../types.js';
import { hasBindAttributes, decodeHTMLEntities } from '../template-utils.js';
import { ContextKey } from '../context-registry.js';
import type { DirectiveRegistry } from './render.js';

/**
 * An indexed directive instance found in the DOM.
 *
 * @internal
 */
export interface IndexedDirective {
  el: Element;
  name: string;
  directive: Directive | null; // null for native slots
  expr: Expression;
  priority: number;
  isNativeSlot?: boolean;
  isCustomElement?: boolean;
  using?: ContextKey<unknown>[];
}

/**
 * Build a CSS selector for all registered directives.
 * Uses the global directive registry to support any prefix (g-, l-, v-, etc.).
 * Also includes local registry entries with g- prefix for backward compatibility.
 *
 * @internal
 */
export function getSelector(localRegistry?: DirectiveRegistry): string {
  const selectors: string[] = [];

  for (const name of getDirectiveNames()) {
    const registration = getDirective(name);
    if (!registration) continue;

    const { options } = registration;

    // Custom element directives - match by tag name
    if (options.template || options.scope || options.provide || options.using || options.fallback) {
      selectors.push(name);
    }

    // All directives can be used as attributes
    selectors.push(`[${name}]`);
  }

  // Add local registry entries with g- prefix (backward compatibility)
  if (localRegistry) {
    for (const name of localRegistry.keys()) {
      const fullName = `g-${name}`;
      // Skip if already in global registry
      if (!getDirective(fullName)) {
        selectors.push(`[${fullName}]`);
      }
    }
  }

  // Also match native <slot> elements
  selectors.push('slot');
  // Match g-scope for inline scope initialization (TODO: make prefix configurable)
  selectors.push('[g-scope]');
  // Match common g-bind:* attributes for dynamic binding
  // These need to be indexed so their expressions can be evaluated with proper scope
  // Note: happy-dom doesn't need colon escaping (and escaped colons don't work)
  selectors.push('[g-bind:class]');
  selectors.push('[g-bind:style]');
  selectors.push('[g-bind:href]');
  selectors.push('[g-bind:src]');
  selectors.push('[g-bind:id]');
  selectors.push('[g-bind:value]');
  selectors.push('[g-bind:disabled]');
  selectors.push('[g-bind:checked]');
  selectors.push('[g-bind:placeholder]');
  selectors.push('[g-bind:title]');
  selectors.push('[g-bind:alt]');
  selectors.push('[g-bind:name]');
  selectors.push('[g-bind:type]');
  // Note: Can't do wildcard for data-* attributes in CSS, but hasBindAttributes handles them

  return selectors.join(',');
}

/**
 * Index all directive elements in a subtree.
 * Discovers elements matching the selector and builds an ordered list
 * of directives to process.
 *
 * @param root - The DOM subtree root to scan
 * @param selector - CSS selector matching directive elements
 * @param registry - Local directive registry for backward compatibility
 * @param index - Accumulator for discovered directives (mutated in place)
 * @param indexed - Set tracking already-indexed elements (mutated in place)
 *
 * @internal
 */
export function indexTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root: any,
  selector: string,
  registry: DirectiveRegistry,
  index: IndexedDirective[],
  indexed: Set<Element>
): void {
  // Get all matching elements in the subtree
  const elements = root.querySelectorAll(selector);

  for (const match of elements) {
    // Skip if already indexed
    if (indexed.has(match)) continue;
    indexed.add(match);

    // Skip elements inside template content (used as placeholders)
    if (match.closest('template')) {
      continue;
    }

    // Handle native <slot> elements
    if (match.tagName === 'SLOT') {
      index.push({
        el: match,
        name: 'slot',
        directive: null,
        expr: '' as Expression,
        priority: DirectivePriority.NORMAL,
        isNativeSlot: true
      });
      continue;
    }

    // Handle g-scope elements that don't have other directives
    if (match.hasAttribute('g-scope')) {
      let hasDirective = false;
      for (const name of getDirectiveNames()) {
        if (match.hasAttribute(name)) {
          hasDirective = true;
          break;
        }
      }
      if (!hasDirective) {
        index.push({
          el: match,
          name: 'scope',
          directive: null,
          expr: '' as Expression,
          priority: DirectivePriority.STRUCTURAL,
          isNativeSlot: false
        });
      }
    }

    // Handle g-bind:* elements that don't have other directives
    if (hasBindAttributes(match)) {
      let hasDirective = false;
      for (const name of getDirectiveNames()) {
        if (match.hasAttribute(name)) {
          hasDirective = true;
          break;
        }
      }
      if (!hasDirective && !match.hasAttribute('g-scope')) {
        index.push({
          el: match,
          name: 'bind',
          directive: null,
          expr: '' as Expression,
          priority: DirectivePriority.NORMAL,
          isNativeSlot: false
        });
      }
    }

    // Check all registered directives from global registry
    const tagName = match.tagName.toLowerCase();

    for (const name of getDirectiveNames()) {
      const registration = getDirective(name);
      if (!registration) continue;

      const { fn, options } = registration;

      // Check if this is a custom element directive (tag name matches)
      if (tagName === name) {
        if (options.template || options.scope || options.provide || options.using || options.fallback) {
          index.push({
            el: match,
            name,
            directive: fn,
            expr: '' as Expression,
            priority: fn?.priority ?? DirectivePriority.TEMPLATE,
            isCustomElement: true,
            using: options.using
          });
        }
      }

      // Check if this is an attribute directive
      const attr = match.getAttribute(name);
      if (attr !== null) {
        index.push({
          el: match,
          name,
          directive: fn,
          expr: decodeHTMLEntities(attr) as Expression,
          priority: fn?.priority ?? DirectivePriority.NORMAL,
          using: options.using
        });
      }
    }

    // Also check local registry for backward compatibility
    for (const [name, directive] of registry) {
      const attr = match.getAttribute(`g-${name}`);
      if (attr !== null) {
        // Skip if already added from global registry
        const fullName = `g-${name}`;
        if (getDirective(fullName)) continue;

        index.push({
          el: match,
          name,
          directive,
          expr: decodeHTMLEntities(attr) as Expression,
          priority: directive.priority ?? DirectivePriority.NORMAL
        });
      }
    }
  }
}
