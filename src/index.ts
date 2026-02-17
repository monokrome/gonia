/**
 * Gonia - A lightweight, SSR-first reactive UI library.
 *
 * @remarks
 * SSR-first design with HTML attributes as directives.
 * Fine-grained reactivity without virtual DOM diffing.
 *
 * @packageDocumentation
 */

export { Mode, Expression, Context, Directive, directive, getDirective, getDirectiveNames, clearDirectives, configureDirective } from './types.js';
export type { DirectiveMeta, RenderOptions, FallbackOption } from './types.js';
export { isAsyncFunction, FallbackSignal } from './async.js';
export { createContext, createChildContext } from './context.js';
export { reactive, effect, createScope, createEffectScope } from './reactivity.js';
export type { EffectScope } from './reactivity.js';
export { createTemplateRegistry, createMemoryRegistry, createServerRegistry } from './templates.js';
export type { TemplateRegistry } from './templates.js';
export { findRoots, parseInterpolation } from './expression.js';
export { getInjectables, isContextKey } from './inject.js';
export type { Injectable } from './inject.js';
export { getRootScope, clearRootScope } from './scope.js';
export { findAncestor } from './dom.js';
export { processElementTree, PROCESSED_ATTR } from './process.js';
export type { ProcessOptions } from './process.js';
export {
  createContextKey,
  registerContext,
  resolveContext,
  hasContext,
  removeContext,
  clearContexts
} from './context-registry.js';
export type { ContextKey } from './context-registry.js';
export * as directives from './directives/index.js';
