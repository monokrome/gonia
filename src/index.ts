/**
 * Gonia - A lightweight, SSR-first reactive UI library.
 *
 * @remarks
 * SSR-first design with HTML attributes as directives.
 * Fine-grained reactivity without virtual DOM diffing.
 *
 * @packageDocumentation
 */

export { Mode, Expression, Context, Directive, directive, getDirective, getDirectiveNames, clearDirectives } from './types.js';
export type { DirectiveMeta } from './types.js';
export { createContext, createChildContext } from './context.js';
export { reactive, effect, createScope, createEffectScope } from './reactivity.js';
export type { EffectScope } from './reactivity.js';
export { createTemplateRegistry, createMemoryRegistry, createServerRegistry } from './templates.js';
export type { TemplateRegistry } from './templates.js';
export { findRoots, parseInterpolation } from './expression.js';
export { getInjectables } from './inject.js';
export { getRootScope, clearRootScope } from './scope.js';
export * as directives from './directives/index.js';
