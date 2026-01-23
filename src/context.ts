/**
 * Context creation and management.
 *
 * @packageDocumentation
 */

import { Mode, Context, Expression } from './types.js';
import { findRoots } from './expression.js';

export type { Context };

/**
 * Create an evaluation context for directives.
 *
 * @remarks
 * Uses {@link findRoots} to only access state keys that the expression
 * actually references, enabling precise dependency tracking with the
 * reactive system.
 *
 * Supports scoped values via `get()` for things like $component, $renderingChain.
 * Create child contexts with `child()` for nested scopes.
 *
 * @param mode - Execution mode (server or client)
 * @param state - The reactive state object
 * @param scope - Optional scoped values (for context-specific data)
 * @returns A new context
 *
 * @example
 * ```ts
 * const state = reactive({ user: { name: 'Alice' } });
 * const ctx = createContext(Mode.CLIENT, state);
 * ctx.eval('user.name' as Expression); // 'Alice'
 *
 * const childCtx = ctx.child({ $component: el });
 * childCtx.get('$component'); // el
 * ```
 */
export function createContext(
  mode: Mode,
  state: Record<string, unknown>,
  scope: Record<string, unknown> = {}
): Context {
  const ctx: Context = {
    mode,

    eval<T = unknown>(expr: Expression): T {
      const roots = findRoots(expr);
      const fn = new Function(...roots, `return (${expr})`);
      const values = roots.map(r => {
        if (r in scope) {
          return scope[r];
        }
        return state[r];
      });
      return fn(...values) as T;
    },

    get<T = unknown>(key: string): T | undefined {
      if (key in scope) {
        return scope[key] as T;
      }
      if (key in state) {
        return state[key] as T;
      }
      return undefined;
    },

    child(additions: Record<string, unknown>): Context {
      return createContext(mode, state, { ...scope, ...additions });
    }
  };

  return ctx;
}

/**
 * Create a child context with additional bindings.
 *
 * @deprecated Use ctx.child() instead
 */
export function createChildContext(
  parent: Context,
  additions: Record<string, unknown>
): Context {
  return parent.child(additions);
}
