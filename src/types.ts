/**
 * Core types for gonia.
 *
 * @packageDocumentation
 */

import type { ContextKey } from './context-registry.js';
import type { Injectable } from './inject.js';

/**
 * Execution mode for the framework.
 */
export enum Mode {
  /** Server-side rendering */
  SERVER = 'server',
  /** Client-side hydration/runtime */
  CLIENT = 'client'
}

declare const __brand: unique symbol;

/**
 * A branded string type for expressions.
 *
 * @remarks
 * This prevents arbitrary strings from being passed as expressions,
 * reducing the risk of eval injection. Only the framework's parser
 * should create Expression values.
 */
export type Expression = string & { [__brand]: 'expression' };

/**
 * Function to evaluate an expression against state.
 */
export type EvalFn = <T = unknown>(expr: Expression) => T;

/**
 * Registry of framework-provided injectables.
 *
 * @remarks
 * For provider contexts, use the second type parameter of `Directive` instead:
 *
 * ```ts
 * const themed: Directive<['$element', 'theme'], {theme: ThemeContext}> = ($el, theme) => {
 *   // theme is typed as ThemeContext
 * };
 * ```
 */
export interface InjectableRegistry {
  /** The expression string from the directive attribute */
  $expr: Expression;
  /** The target DOM element */
  $element: Element;
  /** Function to evaluate expressions against state */
  $eval: EvalFn;
  /** Local reactive state object (isolated per element) */
  $state: Record<string, unknown>;
  /** Root reactive state object (shared across all elements) */
  $rootState: Record<string, unknown>;
  /** Template registry for g-template directive */
  $templates: { get(name: string): Promise<string> };
  /** Current execution mode (server or client) */
  $mode: Mode;
}

/**
 * Extract the value type from a ContextKey.
 */
type ContextKeyValue<K> = K extends ContextKey<infer V> ? V : never;

/**
 * Maps a tuple of injectable names or context keys to their corresponding types.
 *
 * @typeParam K - Tuple of injectable names (strings) or ContextKey objects
 * @typeParam T - Type map (defaults to InjectableRegistry)
 *
 * @example
 * ```ts
 * type Args = MapInjectables<['$element', '$state']>;
 * // => [Element, Record<string, unknown>]
 *
 * // With context keys
 * const MyContext = createContextKey<{ value: number }>('MyContext');
 * type Args2 = MapInjectables<['$element', typeof MyContext]>;
 * // => [Element, { value: number }]
 * ```
 */
export type MapInjectables<
  K extends readonly (string | ContextKey<unknown>)[],
  T = InjectableRegistry
> = {
  [I in keyof K]: K[I] extends ContextKey<unknown>
    ? ContextKeyValue<K[I]>
    : K[I] extends keyof T
      ? T[K[I]]
      : unknown
};

/**
 * Evaluation context passed to directives.
 */
export interface Context {
  /** Current execution mode */
  readonly mode: Mode;

  /**
   * Evaluate an expression against the current state.
   *
   * @typeParam T - Expected return type
   * @param expr - The expression to evaluate
   * @returns The evaluated result
   */
  eval<T = unknown>(expr: Expression): T;

  /**
   * Get a value from the context by key.
   *
   * @param key - The key to look up
   * @returns The value, or undefined
   */
  get<T = unknown>(key: string): T | undefined;

  /**
   * Create a child context with additional values.
   *
   * @param additions - Values to add to the child context
   * @returns A new child context
   */
  child(additions: Record<string, unknown>): Context;
}

/**
 * Directive priority levels.
 *
 * @remarks
 * Higher priority directives run first. Structural directives
 * (like g-if, g-for) need to run before behavioral ones.
 */
export enum DirectivePriority {
  /** Structural directives that control DOM presence (g-if, g-for) */
  STRUCTURAL = 1000,
  /** Template/transclusion directives */
  TEMPLATE = 500,
  /** Normal behavioral directives */
  NORMAL = 0
}

/**
 * Static metadata for a directive.
 *
 * @remarks
 * Declared on the directive function before registration.
 * Used to determine processing order and behavior.
 *
 * @typeParam T - Type map for injectable dependencies
 */
export interface DirectiveMeta<T = InjectableRegistry> {
  /**
   * Whether this directive transcludes content.
   *
   * @remarks
   * If true, children are saved before the directive runs.
   */
  transclude?: boolean;

  /**
   * Dependencies to inject into the directive.
   *
   * @remarks
   * Available injectables:
   * - `$expr`: The expression string from the attribute
   * - `$element`: The target DOM element
   * - `$eval`: Function to evaluate expressions: `(expr) => value`
   * - `$state`: Local reactive state object (isolated per element)
   * - Any registered service names
   * - Any `ContextKey` for typed context resolution
   * - Any names provided by ancestor directives via `$context`
   *
   * @example
   * ```ts
   * // String-based injection
   * myDirective.$inject = ['$element', '$state'];
   *
   * // With typed context keys
   * myDirective.$inject = ['$element', SlotContentContext];
   * ```
   */
  $inject?: readonly Injectable[];

  /**
   * Names this directive exposes as context to descendants.
   *
   * @remarks
   * When a directive declares `$context`, its `$state` becomes
   * available to descendant directives under those names.
   * Useful for passing state through isolate scope boundaries.
   *
   * @example
   * ```ts
   * const themeProvider: Directive = ($state) => {
   *   $state.mode = 'dark';
   * };
   * themeProvider.$inject = ['$state'];
   * themeProvider.$context = ['theme'];
   *
   * // Descendants can inject 'theme'
   * const button: Directive = ($element, theme) => {
   *   console.log(theme.mode);
   * };
   * button.$inject = ['$element', 'theme'];
   * ```
   */
  $context?: string[];

  /**
   * Processing priority. Higher runs first.
   *
   * @defaultValue DirectivePriority.NORMAL
   */
  priority?: number;
}

/**
 * A directive function with typed parameters based on injectable keys.
 *
 * @remarks
 * Use this type annotation to get contextual typing for directive parameters.
 * The tuple of keys maps to parameter types from InjectableRegistry or ContextKey types.
 *
 * @typeParam K - Tuple of injectable key names or ContextKey objects
 * @typeParam T - Optional custom type map to extend InjectableRegistry
 *
 * @example
 * ```ts
 * // Basic usage - $element is typed as Element
 * const myDirective: Directive<['$element']> = ($element) => {
 *   $element.textContent = 'hello';
 * };
 *
 * // Multiple injectables
 * const text: Directive<['$expr', '$element', '$eval']> = ($expr, $element, $eval) => {
 *   $element.textContent = String($eval($expr) ?? '');
 * };
 *
 * // With typed context keys
 * const slot: Directive<['$element', typeof SlotContentContext]> = ($element, content) => {
 *   // content is typed as SlotContent
 *   console.log(content.slots);
 * };
 *
 * // With custom types (extend InjectableRegistry first)
 * declare module 'gonia' {
 *   interface InjectableRegistry {
 *     myService: { doThing(): void };
 *   }
 * }
 * const custom: Directive<['$element', 'myService']> = ($el, svc) => {
 *   svc.doThing();
 * };
 * ```
 */
export type Directive<
  K extends readonly (string | ContextKey<unknown>)[] = readonly (string & keyof InjectableRegistry)[],
  T extends Record<string, unknown> = {}
> = ((...args: MapInjectables<K, InjectableRegistry & T>) => void | Promise<void>) & DirectiveMeta<InjectableRegistry & T>;

/**
 * Attributes passed to template functions.
 */
export interface TemplateAttrs {
  /** The element's innerHTML before transformation */
  children: string;
  /** All attributes from the element */
  [attr: string]: string;
}

/**
 * Template can be a string or a function that receives element attributes and the element.
 */
export type TemplateOption =
  | string
  | ((attrs: TemplateAttrs, el: Element) => string | Promise<string>);

/**
 * Options for directive registration.
 */
export interface DirectiveOptions {
  /**
   * Whether to create a new scope for this directive.
   *
   * @remarks
   * When true, the directive creates a new scope that inherits
   * from the parent scope via prototype chain.
   *
   * @defaultValue false
   */
  scope?: boolean;

  /**
   * Template for the directive's content.
   *
   * @remarks
   * Can be a string or a function that receives the element's
   * attributes and children, returning HTML.
   *
   * @example
   * ```ts
   * // Static template
   * directive('my-modal', handler, {
   *   template: '<div class="modal"><slot></slot></div>'
   * });
   *
   * // Dynamic template with props
   * directive('fancy-heading', null, {
   *   template: ({ level, children }) => `<h${level}>${children}</h${level}>`
   * });
   *
   * // Async template (e.g., dynamic import)
   * directive('lazy-component', handler, {
   *   template: () => import('./template.html?raw').then(m => m.default)
   * });
   * ```
   */
  template?: TemplateOption;

  /**
   * DI provider overrides for descendants.
   *
   * @remarks
   * Maps injectable names to values. Descendants requesting these
   * names via `$inject` will receive the provided values instead
   * of global services.
   *
   * Useful for testing (mock services) or scoping services to a subtree.
   *
   * @example
   * ```ts
   * // Test harness with mock services
   * directive('test-harness', null, {
   *   scope: true,
   *   provide: {
   *     '$http': mockHttpClient,
   *     'apiUrl': 'http://localhost:3000/test'
   *   }
   * });
   *
   * // Descendants get mock values
   * directive('api-consumer', ($http, apiUrl) => {
   *   $http.get(apiUrl + '/users');
   * });
   * ```
   */
  provide?: Record<string, unknown>;
}

/** Registered directive with options */
export interface DirectiveRegistration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: Directive<any> | null;
  options: DirectiveOptions;
}

/** Global directive registry */
const directiveRegistry = new Map<string, DirectiveRegistration>();

/**
 * Register a directive by name.
 *
 * @remarks
 * Directives are functions with `$inject` set to declare dependencies.
 * If the name contains a hyphen and scope is true, it's also registered
 * as a custom element.
 *
 * The function can be `null` for pure template directives that have no
 * runtime behavior.
 *
 * @param name - The directive name (e.g., 'g-text' or 'todo-app')
 * @param fn - The directive function, or null for template-only directives
 * @param options - Registration options
 *
 * @example
 * ```ts
 * // Directive with behavior
 * directive('todo-app', ($element, $state) => {
 *   $state.todos = [];
 * }, { scope: true });
 *
 * // Template-only directive
 * directive('fancy-heading', null, {
 *   template: ({ level, children }) => `<h${level}>${children}</h${level}>`
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function directive(name: string, fn: Directive<any> | null, options: DirectiveOptions = {}): void {
  directiveRegistry.set(name, { fn, options });

  // Register as custom element if name contains hyphen and scope is true
  if (fn && name.includes('-') && options.scope && typeof customElements !== 'undefined') {
    // Defer to avoid circular deps - custom element class is created in scope.ts
    queueMicrotask(() => {
      import('./scope.js').then(({ registerDirectiveElement }) => {
        registerDirectiveElement(name, fn, options);
      });
    });
  }
}

/**
 * Get a directive registration by name.
 *
 * @param name - The directive name
 * @returns The directive registration (fn and options), or undefined if not found
 */
export function getDirective(name: string): DirectiveRegistration | undefined {
  return directiveRegistry.get(name);
}

/**
 * Get a directive function by name.
 *
 * @param name - The directive name
 * @returns The directive function, null for template-only directives, or undefined if not found
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDirectiveFn(name: string): Directive<any> | null | undefined {
  return directiveRegistry.get(name)?.fn;
}

/**
 * Get all registered directive names.
 *
 * @returns Array of directive names
 */
export function getDirectiveNames(): string[] {
  return Array.from(directiveRegistry.keys());
}

/**
 * Clear all registered directives.
 *
 * @remarks
 * Primarily useful for testing.
 */
export function clearDirectives(): void {
  directiveRegistry.clear();
}

/**
 * Configure options for an existing directive.
 *
 * @remarks
 * Merges the provided options with any existing options for the directive.
 * If the directive hasn't been registered yet, stores the options to be
 * applied when it is registered.
 *
 * This is useful for configuring built-in or third-party directives
 * without needing access to the directive function.
 *
 * @param name - The directive name
 * @param options - Options to merge
 *
 * @example
 * ```ts
 * // Add scope to a built-in directive
 * configureDirective('g-text', { scope: true });
 *
 * // Add template to a custom element
 * configureDirective('app-header', {
 *   template: '<header><slot></slot></header>'
 * });
 * ```
 */
export function configureDirective(name: string, options: Partial<DirectiveOptions>): void {
  const existing = directiveRegistry.get(name);
  if (existing) {
    directiveRegistry.set(name, {
      fn: existing.fn,
      options: { ...existing.options, ...options }
    });
  } else {
    // Store options for later - directive will be registered soon
    directiveRegistry.set(name, {
      fn: null,
      options: options as DirectiveOptions
    });
  }
}
