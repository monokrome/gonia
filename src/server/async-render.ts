/**
 * Async directive rendering utilities for server-side rendering.
 *
 * @packageDocumentation
 */

import { Directive, Expression, FallbackOption } from '../types.js';
import { getTemplateAttrs } from '../template-utils.js';
import { generateAsyncId } from '../async.js';
import { ContextKey } from '../context-registry.js';

/**
 * A pending stream chunk for async directives in stream mode.
 * Used by renderStream() to emit replacement scripts after initial HTML.
 *
 * @internal
 */
export interface StreamPendingChunk {
  asyncId: string;
  el: Element;
  fn: Directive;
  options: { template?: FallbackOption; [key: string]: unknown };
  scopeState: Record<string, unknown>;
  rootState: Record<string, unknown>;
  expr: Expression;
  using?: ContextKey<unknown>[];
}

/**
 * Get the nesting depth of an async directive by walking up the DOM.
 *
 * @internal
 */
export function getAsyncDepth(el: Element, depthMap: WeakMap<Element, number>): number {
  let current: Element | null = el.parentElement;
  while (current) {
    const depth = depthMap.get(current);
    if (depth !== undefined) {
      return depth;
    }
    current = current.parentElement;
  }
  return 0;
}

/**
 * Render fallback content for an async directive.
 *
 * @internal
 */
export async function renderFallback(
  el: Element,
  fallback: FallbackOption,
  options: { template?: unknown; [key: string]: unknown },
  ssrMode: string,
  streamCtx?: {
    fn: Directive;
    scopeState: Record<string, unknown>;
    rootState: Record<string, unknown>;
    expr: Expression;
    using?: ContextKey<unknown>[];
    streamPending: StreamPendingChunk[];
  }
): Promise<void> {
  let fallbackHtml: string;
  if (typeof fallback === 'string') {
    fallbackHtml = fallback;
  } else {
    const attrs = getTemplateAttrs(el);
    const result = fallback(attrs, el);
    fallbackHtml = result instanceof Promise ? await result : result;
  }

  el.innerHTML = fallbackHtml;

  if (ssrMode === 'stream') {
    const asyncId = generateAsyncId();
    el.setAttribute('data-g-async', 'streaming');
    el.setAttribute('data-g-async-id', asyncId);

    if (streamCtx) {
      streamCtx.streamPending.push({
        asyncId,
        el,
        fn: streamCtx.fn,
        options: options as StreamPendingChunk['options'],
        scopeState: streamCtx.scopeState,
        rootState: streamCtx.rootState,
        expr: streamCtx.expr,
        using: streamCtx.using,
      });
    }
  } else {
    el.setAttribute('data-g-async', 'pending');
  }
}
