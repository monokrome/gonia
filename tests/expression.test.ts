import { describe, it, expect } from 'vitest';
import { findRoots, parseInterpolation } from '../src/expression.js';

describe('findRoots', () => {
  it('should find simple identifiers', () => {
    expect(findRoots('name')).toEqual(['name']);
  });

  it('should find multiple identifiers', () => {
    const roots = findRoots('a + b + c');
    expect(roots).toContain('a');
    expect(roots).toContain('b');
    expect(roots).toContain('c');
  });

  it('should not duplicate identifiers', () => {
    const roots = findRoots('a + a + a');
    expect(roots).toEqual(['a']);
  });

  it('should find root of nested property access', () => {
    expect(findRoots('user.name')).toEqual(['user']);
  });

  it('should find root of deeply nested access', () => {
    expect(findRoots('user.profile.settings.theme')).toEqual(['user']);
  });

  it('should find multiple roots in complex expressions', () => {
    const roots = findRoots('user.name + " - " + item.title');
    expect(roots).toContain('user');
    expect(roots).toContain('item');
  });

  it('should exclude JavaScript keywords', () => {
    const roots = findRoots('true && false || null');
    expect(roots).not.toContain('true');
    expect(roots).not.toContain('false');
    expect(roots).not.toContain('null');
    expect(roots).toEqual([]);
  });

  it('should return empty array for pure literals', () => {
    expect(findRoots('123')).toEqual([]);
    expect(findRoots('1 + 2')).toEqual([]);
    expect(findRoots('"hello"')).toEqual([]);
  });

  it('should exclude common globals', () => {
    const roots = findRoots('Math.floor(x) + JSON.parse(y)');
    expect(roots).not.toContain('Math');
    expect(roots).not.toContain('JSON');
    expect(roots).toContain('x');
    expect(roots).toContain('y');
  });

  it('should handle string literals correctly', () => {
    const roots = findRoots('"hello" + name');
    expect(roots).not.toContain('hello');
    expect(roots).toEqual(['name']);
  });

  it('should handle single-quoted strings', () => {
    const roots = findRoots("'world' + greeting");
    expect(roots).not.toContain('world');
    expect(roots).toEqual(['greeting']);
  });

  it('should handle template literals', () => {
    const roots = findRoots('`Hello ${name}`');
    // Template literal handling may vary
    expect(roots).toContain('name');
  });

  it('should handle array literals', () => {
    const roots = findRoots('[a, b, c]');
    expect(roots).toContain('a');
    expect(roots).toContain('b');
    expect(roots).toContain('c');
  });

  it('should handle object property shorthand', () => {
    const roots = findRoots('{ a, b }');
    expect(roots).toContain('a');
    expect(roots).toContain('b');
  });

  it('should handle function calls', () => {
    const roots = findRoots('fn(arg1, arg2)');
    expect(roots).toContain('fn');
    expect(roots).toContain('arg1');
    expect(roots).toContain('arg2');
  });

  it('should handle method calls on variables', () => {
    const roots = findRoots('items.filter(x => x > 0)');
    expect(roots).toContain('items');
    expect(roots).toContain('x');
  });

  it('should handle ternary expressions', () => {
    const roots = findRoots('cond ? a : b');
    expect(roots).toContain('cond');
    expect(roots).toContain('a');
    expect(roots).toContain('b');
  });

  it('should handle $-prefixed identifiers', () => {
    expect(findRoots('$styles')).toEqual(['$styles']);
    expect(findRoots('$scope.value')).toEqual(['$scope']);
    expect(findRoots('$index + 1')).toEqual(['$index']);
  });

  it('should handle multiple $-prefixed identifiers', () => {
    const roots = findRoots('$a + $b.prop');
    expect(roots).toContain('$a');
    expect(roots).toContain('$b');
    expect(roots).toHaveLength(2);
  });

  it('should handle mixed regular and $-prefixed identifiers', () => {
    const roots = findRoots('user.name + $styles.card');
    expect(roots).toContain('user');
    expect(roots).toContain('$styles');
    expect(roots).toHaveLength(2);
  });

  it('should exclude $-prefixed property accesses', () => {
    const roots = findRoots('obj.$weird');
    expect(roots).toEqual(['obj']);
  });
});

describe('parseInterpolation', () => {
  it('should return single text segment for no interpolation', () => {
    const segments = parseInterpolation('Hello World');
    expect(segments).toEqual([{ type: 'static', value: 'Hello World' }]);
  });

  it('should parse single expression', () => {
    const segments = parseInterpolation('Hello {{ name }}');
    expect(segments).toEqual([
      { type: 'static', value: 'Hello ' },
      { type: 'expr', value: 'name' }
    ]);
  });

  it('should parse multiple expressions', () => {
    const segments = parseInterpolation('{{ greeting }}, {{ name }}!');
    expect(segments).toEqual([
      { type: 'expr', value: 'greeting' },
      { type: 'static', value: ', ' },
      { type: 'expr', value: 'name' },
      { type: 'static', value: '!' }
    ]);
  });

  it('should handle expressions at start', () => {
    const segments = parseInterpolation('{{ value }} end');
    expect(segments).toEqual([
      { type: 'expr', value: 'value' },
      { type: 'static', value: ' end' }
    ]);
  });

  it('should handle expressions at end', () => {
    const segments = parseInterpolation('start {{ value }}');
    expect(segments).toEqual([
      { type: 'static', value: 'start ' },
      { type: 'expr', value: 'value' }
    ]);
  });

  it('should handle only expression', () => {
    const segments = parseInterpolation('{{ value }}');
    expect(segments).toEqual([
      { type: 'expr', value: 'value' }
    ]);
  });

  it('should handle complex expressions', () => {
    const segments = parseInterpolation('Total: {{ items.length * price }}');
    expect(segments).toEqual([
      { type: 'static', value: 'Total: ' },
      { type: 'expr', value: 'items.length * price' }
    ]);
  });

  it('should trim whitespace in expressions', () => {
    const segments = parseInterpolation('{{   name   }}');
    expect(segments).toEqual([
      { type: 'expr', value: 'name' }
    ]);
  });

  it('should handle adjacent expressions', () => {
    const segments = parseInterpolation('{{ a }}{{ b }}');
    expect(segments).toEqual([
      { type: 'expr', value: 'a' },
      { type: 'expr', value: 'b' }
    ]);
  });
});
