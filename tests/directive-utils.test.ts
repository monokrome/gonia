import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveAssigns, applyAssigns, directiveNeedsScope } from '../src/directive-utils.js';
import { directive, clearDirectives } from '../src/types.js';

describe('directive-utils', () => {
  beforeEach(() => {
    clearDirectives();
  });

  afterEach(() => {
    clearDirectives();
  });

  describe('resolveAssigns', () => {
    it('should return empty values for directives without assigns', () => {
      directive('g-test', () => {});

      const result = resolveAssigns(['g-test']);

      expect(result.values).toEqual({});
      expect(result.warnings).toEqual([]);
    });

    it('should return assigns from a single directive', () => {
      directive('g-test', () => {}, { scope: true, assign: { foo: 'bar', count: 42 } });

      const result = resolveAssigns(['g-test']);

      expect(result.values).toEqual({ foo: 'bar', count: 42 });
      expect(result.warnings).toEqual([]);
    });

    it('should merge non-conflicting assigns from multiple directives', () => {
      directive('g-first', () => {}, { scope: true, assign: { a: 1 } });
      directive('g-second', () => {}, { scope: true, assign: { b: 2 } });

      const result = resolveAssigns(['g-first', 'g-second']);

      expect(result.values).toEqual({ a: 1, b: 2 });
      expect(result.warnings).toEqual([]);
    });

    it('should throw error when same-priority directives conflict on same key', () => {
      directive('g-first', () => {}, { scope: true, assign: { shared: 'from-first' } });
      directive('g-second', () => {}, { scope: true, assign: { shared: 'from-second' } });

      expect(() => resolveAssigns(['g-first', 'g-second'])).toThrow(
        /Conflicting assign key "shared" at same priority/
      );
    });

    it('should allow higher priority to win with warning', () => {
      const lowPriority = () => {};
      lowPriority.priority = 100;
      directive('g-low', lowPriority, { scope: true, assign: { shared: 'low-value' } });

      const highPriority = () => {};
      highPriority.priority = 200;
      directive('g-high', highPriority, { scope: true, assign: { shared: 'high-value' } });

      const result = resolveAssigns(['g-low', 'g-high']);

      expect(result.values).toEqual({ shared: 'high-value' });
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('g-high');
      expect(result.warnings[0]).toContain('overrides');
      expect(result.warnings[0]).toContain('g-low');
    });

    it('should handle mixed conflicting and non-conflicting keys', () => {
      const lowPriority = () => {};
      lowPriority.priority = 100;
      directive('g-low', lowPriority, { scope: true, assign: { shared: 'low', onlyLow: 'a' } });

      const highPriority = () => {};
      highPriority.priority = 200;
      directive('g-high', highPriority, { scope: true, assign: { shared: 'high', onlyHigh: 'b' } });

      const result = resolveAssigns(['g-low', 'g-high']);

      expect(result.values).toEqual({
        shared: 'high',
        onlyLow: 'a',
        onlyHigh: 'b'
      });
      expect(result.warnings).toHaveLength(1);
    });

    it('should handle unknown directive names gracefully', () => {
      const result = resolveAssigns(['g-unknown', 'g-nonexistent']);

      expect(result.values).toEqual({});
      expect(result.warnings).toEqual([]);
    });
  });

  describe('applyAssigns', () => {
    it('should apply assigns to scope', () => {
      directive('g-test', () => {}, { scope: true, assign: { foo: 'bar' } });

      const scope: Record<string, unknown> = { existing: true };
      applyAssigns(scope, ['g-test']);

      expect(scope).toEqual({ existing: true, foo: 'bar' });
    });

    it('should log warnings for priority conflicts', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const lowPriority = () => {};
      lowPriority.priority = 100;
      directive('g-low', lowPriority, { scope: true, assign: { key: 'low' } });

      const highPriority = () => {};
      highPriority.priority = 200;
      directive('g-high', highPriority, { scope: true, assign: { key: 'high' } });

      const scope: Record<string, unknown> = {};
      applyAssigns(scope, ['g-low', 'g-high']);

      expect(scope).toEqual({ key: 'high' });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('[gonia]');

      warnSpy.mockRestore();
    });

    it('should return the scope', () => {
      directive('g-test', () => {}, { scope: true, assign: { foo: 'bar' } });

      const scope: Record<string, unknown> = {};
      const result = applyAssigns(scope, ['g-test']);

      expect(result).toBe(scope);
    });
  });

  describe('directiveNeedsScope', () => {
    it('should return true for directive with scope: true', () => {
      directive('g-scoped', () => {}, { scope: true });

      expect(directiveNeedsScope('g-scoped')).toBe(true);
    });

    it('should return true for directive with assign', () => {
      directive('g-assigned', () => {}, { scope: true, assign: { foo: 'bar' } });

      expect(directiveNeedsScope('g-assigned')).toBe(true);
    });

    it('should return true for directive with $context', () => {
      const fn = () => {};
      fn.$context = ['someContext'];
      directive('g-context', fn);

      expect(directiveNeedsScope('g-context')).toBe(true);
    });

    it('should return false for directive without scope features', () => {
      directive('g-simple', () => {});

      expect(directiveNeedsScope('g-simple')).toBe(false);
    });

    it('should return false for unknown directive', () => {
      expect(directiveNeedsScope('g-unknown')).toBe(false);
    });
  });
});
