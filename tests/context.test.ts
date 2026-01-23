import { describe, it, expect } from 'vitest';
import { createContext, createChildContext } from '../src/context.js';
import { Mode, Expression } from '../src/types.js';

describe('createContext', () => {
  it('should create a context with the given mode', () => {
    const ctx = createContext(Mode.CLIENT, {});
    expect(ctx.mode).toBe(Mode.CLIENT);
  });

  it('should evaluate simple expressions', () => {
    const ctx = createContext(Mode.CLIENT, { name: 'Alice' });
    const result = ctx.eval('name' as Expression);
    expect(result).toBe('Alice');
  });

  it('should evaluate complex expressions', () => {
    const ctx = createContext(Mode.CLIENT, { a: 5, b: 3 });
    const result = ctx.eval('a + b' as Expression);
    expect(result).toBe(8);
  });

  it('should evaluate nested property access', () => {
    const ctx = createContext(Mode.CLIENT, { user: { name: 'Bob' } });
    const result = ctx.eval('user.name' as Expression);
    expect(result).toBe('Bob');
  });

  it('should evaluate expressions with method calls', () => {
    const ctx = createContext(Mode.CLIENT, { items: [1, 2, 3] });
    const result = ctx.eval('items.length' as Expression);
    expect(result).toBe(3);
  });

  it('should evaluate ternary expressions', () => {
    const ctx = createContext(Mode.CLIENT, { show: true, a: 'yes', b: 'no' });
    expect(ctx.eval('show ? a : b' as Expression)).toBe('yes');

    const ctx2 = createContext(Mode.CLIENT, { show: false, a: 'yes', b: 'no' });
    expect(ctx2.eval('show ? a : b' as Expression)).toBe('no');
  });

  it('should handle undefined state values', () => {
    const ctx = createContext(Mode.CLIENT, {});
    const result = ctx.eval('missing' as Expression);
    expect(result).toBeUndefined();
  });

  it('should evaluate expressions using scoped values', () => {
    const ctx = createContext(Mode.CLIENT, { base: 10 }, { multiplier: 5 });
    const result = ctx.eval('base * multiplier' as Expression);
    expect(result).toBe(50);
  });

  it('should prefer scope over state in eval', () => {
    const ctx = createContext(Mode.CLIENT, { value: 100 }, { value: 200 });
    const result = ctx.eval('value' as Expression);
    expect(result).toBe(200);
  });

  it('should throw on syntax errors', () => {
    const ctx = createContext(Mode.CLIENT, {});
    expect(() => ctx.eval('if (' as Expression)).toThrow();
  });
});

describe('context.get', () => {
  it('should get values from state', () => {
    const ctx = createContext(Mode.CLIENT, { name: 'Alice' });
    expect(ctx.get('name')).toBe('Alice');
  });

  it('should get values from scope', () => {
    const ctx = createContext(Mode.CLIENT, {}, { $component: 'test-el' });
    expect(ctx.get('$component')).toBe('test-el');
  });

  it('should prefer scope over state', () => {
    const ctx = createContext(Mode.CLIENT, { value: 'state' }, { value: 'scope' });
    expect(ctx.get('value')).toBe('scope');
  });

  it('should return undefined for missing keys', () => {
    const ctx = createContext(Mode.CLIENT, {});
    expect(ctx.get('missing')).toBeUndefined();
  });
});

describe('context.child', () => {
  it('should create a child context', () => {
    const parent = createContext(Mode.CLIENT, { name: 'Alice' });
    const child = parent.child({ extra: 'value' });

    expect(child.mode).toBe(Mode.CLIENT);
    expect(child.get('extra')).toBe('value');
  });

  it('should inherit parent state', () => {
    const parent = createContext(Mode.CLIENT, { name: 'Alice' });
    const child = parent.child({});

    expect(child.eval('name' as Expression)).toBe('Alice');
  });

  it('should allow child scope to shadow parent scope', () => {
    const parent = createContext(Mode.CLIENT, {}, { value: 'parent' });
    const child = parent.child({ value: 'child' });

    expect(child.get('value')).toBe('child');
  });

  it('should support nested children', () => {
    const root = createContext(Mode.CLIENT, { name: 'Root' });
    const child1 = root.child({ level: 1 });
    const child2 = child1.child({ level: 2 });

    expect(child2.eval('name' as Expression)).toBe('Root');
    expect(child2.get('level')).toBe(2);
  });
});

describe('createChildContext (deprecated)', () => {
  it('should work like ctx.child()', () => {
    const parent = createContext(Mode.CLIENT, { name: 'Alice' });
    const child = createChildContext(parent, { item: 'test' });

    expect(child.eval('name' as Expression)).toBe('Alice');
    expect(child.get('item')).toBe('test');
  });
});
