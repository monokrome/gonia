/**
 * Loop/iteration directive.
 *
 * @packageDocumentation
 */

import { directive, Directive, DirectivePriority, Expression, EvalFn, Mode } from '../types.js';
import { effect, createEffectScope, createScope, EffectScope } from '../reactivity.js';
import { createContext } from '../context.js';

/**
 * Parse a g-for expression.
 *
 * Supports:
 * - `item in items`
 * - `(item, index) in items`
 * - `(value, key) in object`
 */
function parseForExpression(expr: string): {
  itemName: string;
  indexName: string | null;
  iterableName: string;
} | null {
  const trimmed = expr.trim();

  // Match "(item, index) in iterable" or "item in iterable"
  const match = trimmed.match(
    /^\(?([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*))?\)?\s+in\s+(.+)$/
  );

  if (!match) {
    return null;
  }

  return {
    itemName: match[1],
    indexName: match[2] || null,
    iterableName: match[3].trim()
  };
}

/** Attribute used to mark elements processed by g-for */
export const FOR_PROCESSED_ATTR = 'data-g-for-processed';

/** Attribute used to mark template content that should be skipped during SSR */
export const FOR_TEMPLATE_ATTR = 'data-g-for-template';

/**
 * Process directives on a cloned element within a child scope.
 */
function processClonedElement(
  el: Element,
  parentState: Record<string, unknown>,
  scopeAdditions: Record<string, unknown>,
  mode: Mode
): void {
  // Mark this element as processed by g-for so hydrate skips it
  el.setAttribute(FOR_PROCESSED_ATTR, '');

  const childScope = createScope(parentState, scopeAdditions);
  const childCtx = createContext(mode, childScope);

  // Process g-text directives
  const textAttr = el.getAttribute('g-text');
  if (textAttr) {
    const value = childCtx.eval(textAttr as Expression);
    el.textContent = String(value ?? '');
  }

  // Process g-class directives
  const classAttr = el.getAttribute('g-class');
  if (classAttr) {
    const classObj = childCtx.eval<Record<string, boolean>>(classAttr as Expression);
    if (classObj && typeof classObj === 'object') {
      for (const [className, shouldAdd] of Object.entries(classObj)) {
        if (shouldAdd) {
          el.classList.add(className);
        } else {
          el.classList.remove(className);
        }
      }
    }
  }

  // Process g-show directives
  const showAttr = el.getAttribute('g-show');
  if (showAttr) {
    const value = childCtx.eval(showAttr as Expression);
    (el as HTMLElement).style.display = value ? '' : 'none';
  }

  // Process g-on directives (format: "event: handler") - client only
  if (mode === Mode.CLIENT) {
    const onAttr = el.getAttribute('g-on');
    if (onAttr) {
      setupEventHandler(el, onAttr, childCtx, childScope);
    }
  }

  // Process children recursively
  for (const child of el.children) {
    processClonedElement(child, childScope, {}, mode);
  }
}

/**
 * Set up an event handler on an element.
 * Expression format: "event: handler"
 */
function setupEventHandler(
  el: Element,
  expr: string,
  ctx: { eval: EvalFn },
  state: Record<string, unknown>
): void {
  const colonIdx = expr.indexOf(':');
  if (colonIdx === -1) {
    console.error(`Invalid g-on expression: ${expr}. Expected "event: handler"`);
    return;
  }

  const eventName = expr.slice(0, colonIdx).trim();
  const handlerExpr = expr.slice(colonIdx + 1).trim();

  const handler = (event: Event) => {
    const result = ctx.eval(handlerExpr as Expression);
    if (typeof result === 'function') {
      result.call(state, event);
    }
  };

  el.addEventListener(eventName, handler);
}

/**
 * Render loop items (used by both server and client).
 */
function renderItems(
  template: Element,
  parent: Node,
  insertAfterNode: Node,
  parsed: { itemName: string; indexName: string | null; iterableName: string },
  $eval: EvalFn,
  $state: Record<string, unknown>,
  mode: Mode
): Element[] {
  const { itemName, indexName, iterableName } = parsed;
  const iterable = $eval<unknown>(iterableName as Expression);
  const renderedElements: Element[] = [];

  if (iterable == null) {
    return renderedElements;
  }

  let items: Array<[unknown, unknown]>;

  if (Array.isArray(iterable)) {
    items = iterable.map((item, index) => [item, index]);
  } else if (typeof iterable === 'object') {
    items = Object.entries(iterable).map(([k, v]) => [v, k]);
  } else {
    return renderedElements;
  }

  let insertAfter: Node = insertAfterNode;
  const length = items.length;

  for (let i = 0; i < length; i++) {
    const [value, key] = items[i];
    const clone = template.cloneNode(true) as Element;

    // Remove template marker from clone (it's not a template, it's a rendered item)
    clone.removeAttribute(FOR_TEMPLATE_ATTR);

    const scopeAdditions: Record<string, unknown> = {
      [itemName]: value,
      $index: i,
      $first: i === 0,
      $last: i === length - 1,
      $even: i % 2 === 0,
      $odd: i % 2 === 1
    };

    if (indexName) {
      scopeAdditions[indexName] = key;
    }

    processClonedElement(clone, $state, scopeAdditions, mode);

    if (insertAfter.nextSibling) {
      parent.insertBefore(clone, insertAfter.nextSibling);
    } else {
      parent.appendChild(clone);
    }

    renderedElements.push(clone);
    insertAfter = clone;
  }

  return renderedElements;
}

/**
 * Remove SSR-rendered items (siblings with FOR_PROCESSED_ATTR after template).
 */
function removeSSRItems(templateEl: Element): void {
  let sibling = templateEl.nextElementSibling;
  while (sibling && sibling.hasAttribute(FOR_PROCESSED_ATTR)) {
    const next = sibling.nextElementSibling;
    sibling.remove();
    sibling = next;
  }
}

/**
 * Iterate over array or object items.
 *
 * @remarks
 * Creates a copy of the template element for each item in the iterable.
 * Supports arrays and objects. For arrays, provides item and index.
 * For objects, provides value and key.
 *
 * On server: wraps template in <template> element, renders items after it.
 * On client: finds <template g-for>, extracts template, sets up reactive loop.
 *
 * @example
 * ```html
 * <li g-for="item in items" g-text="item.name"></li>
 * <li g-for="(item, index) in items" g-text="index + ': ' + item.name"></li>
 * <div g-for="(value, key) in object" g-text="key + ': ' + value"></div>
 * ```
 */
export const cfor: Directive<['$expr', '$element', '$eval', '$state', '$mode']> = function cfor(
  $expr: Expression,
  $element: Element,
  $eval: EvalFn,
  $state: Record<string, unknown>,
  $mode: Mode
) {
  const parsed = parseForExpression($expr as string);
  if (!parsed) {
    console.error(`Invalid g-for expression: ${$expr}`);
    return;
  }

  const parent = $element.parentNode;
  if (!parent) {
    return;
  }

  const isTemplateElement = $element.tagName === 'TEMPLATE';

  // Server-side rendering
  if ($mode === Mode.SERVER) {
    // Create a <template> element to hold the original
    const templateWrapper = $element.ownerDocument.createElement('template');
    templateWrapper.setAttribute('g-for', $expr as string);

    // Clone the original element (without g-for attr) into the template
    const templateContent = $element.cloneNode(true) as Element;
    templateContent.removeAttribute('g-for');
    // Mark as template content so render loop skips it
    templateContent.setAttribute(FOR_TEMPLATE_ATTR, '');

    // Append directly to template element (linkedom doesn't support .content)
    // Browsers will automatically move this to .content when parsing
    templateWrapper.appendChild(templateContent);

    // Replace original with template wrapper
    parent.replaceChild(templateWrapper, $element);

    // Render items after the template
    renderItems(templateContent, parent, templateWrapper, parsed, $eval, $state, $mode);
    return;
  }

  // Client-side: check if hydrating from SSR or fresh render
  if (isTemplateElement) {
    // Hydrating from SSR: element is <template g-for="...">
    const templateWrapper = $element as HTMLTemplateElement;
    const templateContent = templateWrapper.content.firstElementChild;

    if (!templateContent) {
      console.error('g-for template element has no content');
      return;
    }

    // Remove SSR-rendered items
    removeSSRItems(templateWrapper);

    // Set up reactive loop
    let renderedElements: Element[] = [];
    let scope: EffectScope | null = null;

    effect(() => {
      if (scope) {
        scope.stop();
      }
      for (const el of renderedElements) {
        el.remove();
      }

      scope = createEffectScope();
      scope.run(() => {
        renderedElements = renderItems(
          templateContent,
          parent,
          templateWrapper,
          parsed,
          $eval,
          $state,
          Mode.CLIENT
        );
      });
    });
  } else {
    // Fresh client render: element has g-for attribute directly
    // Wrap in template element for consistency
    const templateWrapper = $element.ownerDocument.createElement('template');
    templateWrapper.setAttribute('g-for', $expr as string);

    const templateContent = $element.cloneNode(true) as Element;
    templateContent.removeAttribute('g-for');
    templateWrapper.content.appendChild(templateContent);

    parent.replaceChild(templateWrapper, $element);

    // Set up reactive loop
    let renderedElements: Element[] = [];
    let scope: EffectScope | null = null;

    effect(() => {
      if (scope) {
        scope.stop();
      }
      for (const el of renderedElements) {
        el.remove();
      }

      scope = createEffectScope();
      scope.run(() => {
        renderedElements = renderItems(
          templateContent,
          parent,
          templateWrapper,
          parsed,
          $eval,
          $state,
          Mode.CLIENT
        );
      });
    });
  }
};

cfor.$inject = ['$expr', '$element', '$eval', '$state', '$mode'];
cfor.priority = DirectivePriority.STRUCTURAL;

directive('g-for', cfor);
