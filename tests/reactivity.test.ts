import { describe, it, expect, vi } from 'vitest';
import { reactive, effect, createScope, createEffectScope } from '../src/reactivity.js';

describe('reactive', () => {
  it('should return a proxy that tracks property access', () => {
    const state = reactive({ count: 0 });
    expect(state.count).toBe(0);
  });

  it('should allow property mutation', () => {
    const state = reactive({ count: 0 });
    state.count = 5;
    expect(state.count).toBe(5);
  });

  it('should make nested objects reactive', () => {
    const state = reactive({ user: { name: 'Alice' } });
    expect(state.user.name).toBe('Alice');
    state.user.name = 'Bob';
    expect(state.user.name).toBe('Bob');
  });

  it('should handle array mutations', () => {
    const state = reactive({ items: [1, 2, 3] });
    state.items.push(4);
    expect(state.items).toEqual([1, 2, 3, 4]);
  });
});

describe('effect', () => {
  it('should run immediately', () => {
    const fn = vi.fn();
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should re-run when tracked dependencies change', () => {
    const state = reactive({ count: 0 });
    const fn = vi.fn(() => state.count);

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    state.count = 1;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not re-run when untracked properties change', () => {
    const state = reactive({ a: 1, b: 2 });
    const fn = vi.fn(() => state.a);

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    state.b = 3;
    expect(fn).toHaveBeenCalledTimes(1); // Still 1, b not tracked
  });

  it('should track nested property access', () => {
    const state = reactive({ user: { name: 'Alice' } });
    const fn = vi.fn(() => state.user.name);

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    state.user.name = 'Bob';
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should return a cleanup function', () => {
    const state = reactive({ count: 0 });
    const fn = vi.fn(() => state.count);

    const stop = effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    stop();
    state.count = 1;
    expect(fn).toHaveBeenCalledTimes(1); // Still 1, effect stopped
  });

  it('should not trigger on same value assignment', () => {
    const state = reactive({ count: 5 });
    const fn = vi.fn(() => state.count);

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    state.count = 5; // Same value
    expect(fn).toHaveBeenCalledTimes(1); // No re-run
  });

  it('should handle property deletion', () => {
    const state = reactive({ a: 1 } as Record<string, number>);
    const fn = vi.fn(() => state.a);

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    delete state.a;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not trigger on deleting non-existent property', () => {
    const state = reactive({ a: 1 } as Record<string, number>);
    const fn = vi.fn(() => state.a);

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    delete state.b; // Property doesn't exist
    expect(fn).toHaveBeenCalledTimes(1); // No re-run
  });
});

describe('createEffectScope', () => {
  it('should create a scope that tracks effects', () => {
    const scope = createEffectScope();
    expect(scope.active).toBe(true);
  });

  it('should stop all effects when stopped', () => {
    const state = reactive({ a: 1, b: 2 });
    const fnA = vi.fn(() => state.a);
    const fnB = vi.fn(() => state.b);

    const scope = createEffectScope();
    scope.run(() => {
      effect(fnA);
      effect(fnB);
    });

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);

    state.a = 2;
    state.b = 3;
    expect(fnA).toHaveBeenCalledTimes(2);
    expect(fnB).toHaveBeenCalledTimes(2);

    scope.stop();

    state.a = 3;
    state.b = 4;
    expect(fnA).toHaveBeenCalledTimes(2); // Stopped
    expect(fnB).toHaveBeenCalledTimes(2); // Stopped
  });

  it('should mark scope as inactive after stop', () => {
    const scope = createEffectScope();
    expect(scope.active).toBe(true);

    scope.stop();
    expect(scope.active).toBe(false);
  });

  it('should be safe to call stop multiple times', () => {
    const state = reactive({ count: 0 });
    const fn = vi.fn(() => state.count);

    const scope = createEffectScope();
    scope.run(() => effect(fn));

    scope.stop();
    scope.stop(); // Second stop should be no-op
    scope.stop(); // Third stop should be no-op

    expect(scope.active).toBe(false);
    state.count = 1;
    expect(fn).toHaveBeenCalledTimes(1); // Still stopped
  });

  it('should return value from run', () => {
    const scope = createEffectScope();
    const result = scope.run(() => 42);
    expect(result).toBe(42);
  });
});

describe('createScope', () => {
  it('should create a child scope with additions', () => {
    const parent = reactive({ items: [1, 2, 3] });
    const child = createScope(parent, { item: 1, index: 0 });

    expect(child.item).toBe(1);
    expect(child.index).toBe(0);
  });

  it('should inherit from parent', () => {
    const parent = reactive({ items: [1, 2, 3], name: 'test' });
    const child = createScope(parent, { item: 1 });

    expect(child.items).toEqual([1, 2, 3]);
    expect(child.name).toBe('test');
  });

  it('should allow child properties to shadow parent', () => {
    const parent = reactive({ value: 'parent' });
    const child = createScope(parent, { value: 'child' });

    expect(child.value).toBe('child');
  });

  it('should propagate parent changes', () => {
    const parent = reactive({ count: 0 });
    const child = createScope(parent, { item: 'x' });

    parent.count = 5;
    expect(child.count).toBe(5);
  });

  it('should be reactive', () => {
    const parent = reactive({ count: 0 });
    const child = createScope(parent, { item: 'x' });
    const fn = vi.fn(() => child.count);

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    parent.count = 1;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should allow setting child properties', () => {
    const parent = reactive({ count: 0 });
    const child = createScope(parent, { item: 'x' });

    child.item = 'y';
    expect(child.item).toBe('y');
    expect((parent as any).item).toBeUndefined();
  });

  it('should propagate sets to parent for parent-only keys', () => {
    const parent = reactive({ count: 0 });
    const child = createScope(parent, { item: 'x' });

    child.count = 10;
    expect(child.count).toBe(10);
    expect(parent.count).toBe(10);
  });

  it('should not affect parent when setting shadowed property', () => {
    const parent = reactive({ value: 'parent' });
    const child = createScope(parent, { value: 'child' });

    child.value = 'updated';
    expect(child.value).toBe('updated');
    expect(parent.value).toBe('parent');
  });
});
