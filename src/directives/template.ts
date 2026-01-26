/**
 * Template directive for rendering reusable templates.
 *
 * @remarks
 * Saves the element's children for slot transclusion,
 * fetches and renders the template, and sets up context
 * for nested slots to access the saved content.
 *
 * @packageDocumentation
 */

import { directive, Directive, DirectivePriority, Expression } from '../types.js';
import { createEffectScope, EffectScope } from '../reactivity.js';
import { findAncestor } from '../dom.js';

/** Type for $templates injectable */
type Templates = { get(name: string): Promise<string> };

/**
 * Saved slot content for an element.
 *
 * @internal
 */
export interface SlotContent {
  /** Content by slot name. 'default' for unnamed content. */
  slots: Map<string, string>;
}

/** WeakMap storing saved children per element. */
const savedContent = new WeakMap<Element, SlotContent>();

/** WeakMap storing effect scopes per element for cleanup. */
const elementScopes = new WeakMap<Element, EffectScope>();

/** Set tracking which templates are currently rendering (cycle detection). */
const renderingChain = new WeakMap<Element, Set<string>>();

/**
 * Get saved slot content for an element.
 *
 * @internal
 */
export function getSavedContent(el: Element): SlotContent | undefined {
  return savedContent.get(el);
}

/**
 * Find the nearest ancestor with saved content (the template element).
 *
 * @internal
 */
export function findTemplateAncestor(el: Element): Element | null {
  return findAncestor(el, (e) => savedContent.has(e) ? e : undefined) ?? null;
}

/**
 * Check if a node is an Element.
 *
 * @internal
 */
function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/**
 * Extract slot content from an element's children.
 *
 * @internal
 */
function extractSlotContent(el: Element): Map<string, string> {
  const slots = new Map<string, string>();
  const defaultParts: string[] = [];

  for (const child of Array.from(el.childNodes)) {
    if (isElement(child) && child.hasAttribute('slot')) {
      const slotName = child.getAttribute('slot')!;
      const existing = slots.get(slotName) ?? '';
      slots.set(slotName, existing + (child as Element).outerHTML);
    } else if (isElement(child)) {
      defaultParts.push((child as Element).outerHTML);
    } else if (child.nodeType === 3) { // TEXT_NODE
      const text = child.textContent!;
      if (text.trim()) {
        defaultParts.push(text);
      }
    }
  }

  if (defaultParts.length > 0) {
    slots.set('default', defaultParts.join(''));
  }

  return slots;
}

/**
 * Template directive for rendering reusable templates.
 *
 * @remarks
 * Fetches a template by name and replaces the element's content.
 * Children are saved for slot transclusion before replacement.
 *
 * @example
 * ```html
 * <div g-template="dialog">
 *   <span slot="header">Title</span>
 *   <p>Body content</p>
 * </div>
 * ```
 */
export const template: Directive<['$expr', '$element', '$templates']> = async function template(
  $expr: Expression,
  $element: Element,
  $templates: Templates
) {
  const templateName = String($expr);

  // Clean up previous render if re-rendering
  const prevScope = elementScopes.get($element);
  if (prevScope) {
    prevScope.stop();
    // Clear the element's own chain since we're starting fresh
    renderingChain.delete($element);
  }

  // Cycle detection - only inherit from ancestors
  let chain: Set<string> | undefined;
  let parent = $element.parentElement;
  while (parent) {
    const parentChain = renderingChain.get(parent);
    if (parentChain) {
      chain = new Set(parentChain);
      break;
    }
    parent = parent.parentElement;
  }
  chain = chain ?? new Set();

  if (chain.has(templateName)) {
    console.error(`Cycle detected: template "${templateName}" is already being rendered`);
    return;
  }

  // Save children for slots
  const slotContent: SlotContent = {
    slots: extractSlotContent($element)
  };
  savedContent.set($element, slotContent);

  // Track this template in the chain
  const newChain = new Set(chain);
  newChain.add(templateName);
  renderingChain.set($element, newChain);

  // Create effect scope for this element's descendants
  const scope = createEffectScope();
  elementScopes.set($element, scope);

  // Fetch and render template
  const html = await $templates.get(templateName);
  $element.innerHTML = html;

  // Note: MutationObserver will process the new children
};
template.$inject = ['$expr', '$element', '$templates'];
template.transclude = true;
template.priority = DirectivePriority.TEMPLATE;

directive('g-template', template);

/**
 * Get the effect scope for an element.
 *
 * @internal
 */
export function getEffectScope(el: Element): EffectScope | undefined {
  return elementScopes.get(el);
}

