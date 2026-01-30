/**
 * Streaming server-side rendering for async directives.
 *
 * @packageDocumentation
 */

import { RenderOptions, getDirective, Mode } from '../types.js';
import { createContext } from '../context.js';
import { resolveDependencies as resolveInjectables } from '../inject.js';
import { createServerResolverConfig, ServiceRegistry } from '../resolver-config.js';
import { getTemplateAttrs } from '../template-utils.js';
import { FallbackSignal } from '../async.js';
import { render } from './render.js';
import type { DirectiveRegistry } from './render.js';
import type { StreamPendingChunk } from './async-render.js';

/** Registered services (shared with render.ts via import) */
let streamServices: ServiceRegistry = new Map();

/**
 * Set the services registry for streaming (mirrors render.ts registerService).
 *
 * @internal
 */
export function setStreamServices(services: ServiceRegistry): void {
  streamServices = services;
}

/**
 * Render HTML as a ReadableStream, streaming async directive replacements.
 *
 * @remarks
 * 1. Calls `render()` with an internal collector for stream-mode chunks
 * 2. Enqueues the initial HTML (containing fallbacks)
 * 3. For each pending chunk: awaits the fn, renders the template, emits
 *    a `<script>` that swaps innerHTML by `data-g-async-id`
 * 4. Closes the stream
 *
 * @param html - The HTML template string
 * @param state - The state object for expression evaluation
 * @param registry - The directive registry
 * @param options - Optional rendering configuration
 * @returns A ReadableStream of HTML string chunks
 */
export function renderStream(
  html: string,
  state: Record<string, unknown>,
  registry: DirectiveRegistry,
  options?: RenderOptions
): ReadableStream<string> {
  const pending: StreamPendingChunk[] = [];

  return new ReadableStream<string>({
    async start(controller) {
      try {
        const initialHtml = await render(html, state, registry, options, pending);
        controller.enqueue(initialHtml);

        for (const chunk of pending) {
          try {
            const registration = getDirective(chunk.fn.name ?? '');
            const regOptions = registration?.options ?? {};

            const ctx = createContext(Mode.SERVER, chunk.scopeState);
            const config = createServerResolverConfig(
              chunk.el,
              chunk.scopeState,
              chunk.rootState,
              streamServices
            );

            const args = resolveInjectables(
              chunk.fn,
              chunk.expr,
              chunk.el,
              ctx.eval.bind(ctx),
              config,
              chunk.using
            );

            try {
              await (chunk.fn as (...args: unknown[]) => Promise<void>)(...args);
            } catch (e) {
              if (e instanceof FallbackSignal) continue;
              throw e;
            }

            // Render template
            const template = chunk.options.template ?? regOptions.template;
            let templateHtml = '';
            if (template) {
              const attrs = getTemplateAttrs(chunk.el);
              if (typeof template === 'string') {
                templateHtml = template;
              } else {
                const result = template(attrs, chunk.el);
                templateHtml = result instanceof Promise ? await result : result;
              }
            }

            // Escape for inline script
            const escaped = templateHtml
              .replace(/\\/g, '\\\\')
              .replace(/'/g, "\\'")
              .replace(/\n/g, '\\n');

            const script =
              `<script>` +
              `(function(){` +
              `var el=document.querySelector('[data-g-async-id="${chunk.asyncId}"]');` +
              `if(el){` +
              `el.innerHTML='${escaped}';` +
              `el.setAttribute('data-g-async','loaded');` +
              `el.removeAttribute('data-g-async-id');` +
              `if(window.__gonia_hydrate)window.__gonia_hydrate(el);` +
              `}` +
              `})()` +
              `</script>`;

            controller.enqueue(script);
          } catch {
            // Failed to resolve this chunk — leave fallback
          }
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    }
  });
}
