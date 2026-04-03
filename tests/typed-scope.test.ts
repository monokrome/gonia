import { describe, it, expectTypeOf } from 'vitest';
import type { Directive, ScopedDirective } from '../src/types.js';
import type { ContextKey } from '../src/context-registry.js';

describe('Typed scope generics', () => {
  it('should type $scope as Record<string, unknown> by default', () => {
    type D = Directive<['$scope']>;
    type Args = Parameters<D>;
    expectTypeOf<Args>().toEqualTypeOf<[Record<string, unknown>]>();
  });

  it('should override $scope type via second generic param', () => {
    type D = Directive<['$scope'], { $scope: { count: number } }>;
    type Args = Parameters<D>;
    expectTypeOf<Args>().toEqualTypeOf<[{ count: number }]>();
  });

  it('should preserve other injectable types when overriding $scope', () => {
    type D = Directive<['$element', '$scope'], { $scope: { name: string } }>;
    type Args = Parameters<D>;
    expectTypeOf<Args[0]>().toEqualTypeOf<Element>();
    expectTypeOf<Args[1]>().toEqualTypeOf<{ name: string }>();
  });

  it('should work with no overrides (backwards compatible)', () => {
    type D = Directive<['$element', '$eval']>;
    type Args = Parameters<D>;
    expectTypeOf<Args[0]>().toEqualTypeOf<Element>();
  });

  it('should work with ScopedDirective convenience type', () => {
    type D = ScopedDirective<['$element', '$scope'], { count: number; increment: () => void }>;
    type Args = Parameters<D>;
    expectTypeOf<Args[0]>().toEqualTypeOf<Element>();
    expectTypeOf<Args[1]>().toEqualTypeOf<{ count: number; increment: () => void }>();
  });

  it('should resolve context keys alongside typed scope', () => {
    const Key = {} as ContextKey<{ theme: string }>;
    type D = Directive<['$scope', typeof Key], { $scope: { active: boolean } }>;
    type Args = Parameters<D>;
    expectTypeOf<Args[0]>().toEqualTypeOf<{ active: boolean }>();
    expectTypeOf<Args[1]>().toEqualTypeOf<{ theme: string }>();
  });
});
