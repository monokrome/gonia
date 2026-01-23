/**
 * Fine-grained reactivity system using Proxies.
 *
 * @remarks
 * Each directive becomes its own effect, tracking only the state it accesses.
 * Changes trigger only the affected effects - no component re-renders, no diffing.
 *
 * @packageDocumentation
 */

type Effect = () => void;

let activeEffect: Effect | null = null;
let activeScope: EffectScope | null = null;
const targetMap = new WeakMap<object, Map<string | symbol, Set<Effect>>>();
const effectDeps = new Map<Effect, Set<Set<Effect>>>();

/**
 * A scope that groups effects for collective disposal.
 *
 * @remarks
 * Used for cleanup when elements are removed or re-rendered.
 * All effects created within a scope can be stopped at once.
 */
export interface EffectScope {
  /**
   * Run a function within this scope.
   * Any effects created will be tracked by this scope.
   */
  run<T>(fn: () => T): T;

  /**
   * Stop all effects in this scope.
   */
  stop(): void;

  /**
   * Whether the scope has been stopped.
   */
  active: boolean;
}

/**
 * Create an effect scope for grouping effects.
 *
 * @remarks
 * Effects created within the scope's `run()` are tracked.
 * Call `stop()` to dispose all tracked effects at once.
 *
 * @example
 * ```ts
 * const scope = createEffectScope();
 *
 * scope.run(() => {
 *   effect(() => console.log(state.a));
 *   effect(() => console.log(state.b));
 * });
 *
 * // Later: stop all effects
 * scope.stop();
 * ```
 */
interface InternalScope extends EffectScope {
  _effects: Array<() => void>;
}

export function createEffectScope(): EffectScope {
  const scope: InternalScope = {
    _effects: [],
    active: true,

    run<T>(fn: () => T): T {
      const prevScope = activeScope;
      activeScope = scope;
      try {
        return fn();
      } finally {
        activeScope = prevScope;
      }
    },

    stop() {
      if (scope.active) {
        for (const stopFn of scope._effects) {
          stopFn();
        }
        scope._effects.length = 0;
        scope.active = false;
      }
    }
  };

  return scope;
}

/**
 * Register an effect's stop function with the active scope.
 *
 * @internal
 */
function registerWithScope(stopFn: () => void): void {
  if (activeScope && activeScope.active) {
    (activeScope as InternalScope)._effects.push(stopFn);
  }
}

/**
 * Make an object deeply reactive.
 *
 * @remarks
 * Property access is tracked when inside an effect. Mutations trigger
 * all effects that depend on the changed property.
 *
 * @typeParam T - Object type
 * @param target - The object to make reactive
 * @returns A reactive proxy of the object
 *
 * @example
 * ```ts
 * const state = reactive({ count: 0 });
 * effect(() => console.log(state.count));
 * state.count = 1; // logs: 1
 * ```
 */
export function reactive<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      track(obj, key);
      const value = Reflect.get(obj, key, receiver);
      if (value !== null && typeof value === 'object') {
        return reactive(value);
      }
      return value;
    },
    set(obj, key, value, receiver) {
      const oldValue = Reflect.get(obj, key, receiver);
      const result = Reflect.set(obj, key, value, receiver);
      if (oldValue !== value) {
        trigger(obj, key);
      }
      return result;
    },
    deleteProperty(obj, key) {
      const hadKey = key in obj;
      const result = Reflect.deleteProperty(obj, key);
      if (hadKey) {
        trigger(obj, key);
      }
      return result;
    }
  });
}

/**
 * Track a dependency: the active effect depends on target[key].
 *
 * @internal
 */
function track(target: object, key: string | symbol): void {
  if (!activeEffect) return;

  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }

  let deps = depsMap.get(key);
  if (!deps) {
    deps = new Set();
    depsMap.set(key, deps);
  }

  deps.add(activeEffect);

  let trackedDeps = effectDeps.get(activeEffect);
  if (!trackedDeps) {
    trackedDeps = new Set();
    effectDeps.set(activeEffect, trackedDeps);
  }
  trackedDeps.add(deps);
}

/**
 * Trigger effects that depend on target[key].
 *
 * @internal
 */
function trigger(target: object, key: string | symbol): void {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  const deps = depsMap.get(key);
  if (deps) {
    const effectsToRun = [...deps];
    effectsToRun.forEach(effect => effect());
  }
}

/**
 * Create a reactive effect.
 *
 * @remarks
 * The function runs immediately, tracking dependencies.
 * It re-runs automatically whenever those dependencies change.
 *
 * @param fn - The effect function to run
 * @returns A cleanup function to stop the effect
 *
 * @example
 * ```ts
 * const state = reactive({ count: 0 });
 * const stop = effect(() => {
 *   console.log('Count:', state.count);
 * });
 * state.count = 1; // logs: Count: 1
 * stop(); // effect no longer runs
 * ```
 */
export function effect(fn: Effect): () => void {
  const run = () => {
    cleanup(run);
    activeEffect = run;
    fn();
    activeEffect = null;
  };

  run();

  const stopFn = () => cleanup(run);
  registerWithScope(stopFn);

  return stopFn;
}

/**
 * Remove an effect from all dependency sets.
 *
 * @internal
 */
function cleanup(effectFn: Effect): void {
  const trackedDeps = effectDeps.get(effectFn);
  if (trackedDeps) {
    for (const deps of trackedDeps) {
      deps.delete(effectFn);
    }
    trackedDeps.clear();
  }
}

/**
 * Create a child reactive scope.
 *
 * @remarks
 * Used by structural directives like c-for to create per-item contexts.
 * The child scope inherits from the parent, with additions taking precedence.
 *
 * @typeParam T - Parent object type
 * @param parent - The parent reactive object
 * @param additions - Additional properties for this scope
 * @returns A new reactive scope that inherits from parent
 *
 * @example
 * ```ts
 * const parent = reactive({ items: [1, 2, 3] });
 * const child = createScope(parent, { item: 1, index: 0 });
 * child.item;  // 1
 * child.items; // [1, 2, 3] (from parent)
 * ```
 */
export function createScope<T extends object>(
  parent: T,
  additions: Record<string, unknown>
): T & Record<string, unknown> {
  const scope = reactive({ ...additions });

  return new Proxy(scope as T & Record<string, unknown>, {
    get(target, key, receiver) {
      if (key in target) {
        return Reflect.get(target, key, receiver);
      }
      return (parent as Record<string | symbol, unknown>)[key];
    },
    set(target, key, value, receiver) {
      if (key in target) {
        return Reflect.set(target, key, value, receiver);
      }
      return Reflect.set(parent, key, value);
    }
  });
}
