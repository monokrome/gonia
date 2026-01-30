/**
 * Tests for dependency injection utilities.
 */

import { describe, it, expect, vi } from 'vitest';
import { getInjectables, resolveDependencies, DependencyResolverConfig } from '../src/inject.js';
import { Expression } from '../src/types.js';

function makeConfig(overrides: Partial<DependencyResolverConfig> = {}): DependencyResolverConfig {
  return {
    resolveContext: () => undefined,
    resolveState: () => ({}),
    mode: 'client',
    ...overrides,
  };
}

describe('getInjectables', () => {
  it('should return $inject array when present', () => {
    const fn = () => {};
    fn.$inject = ['$element', '$scope'];
    expect(getInjectables(fn)).toEqual(['$element', '$scope']);
  });

  it('should parse parameter names when $inject is absent', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fn = function ($element: unknown, $scope: unknown) {};
    expect(getInjectables(fn)).toEqual(['$element', '$scope']);
  });

  it('should return empty array for parameterless function', () => {
    const fn = () => {};
    expect(getInjectables(fn)).toEqual([]);
  });
});

describe('resolveDependencies', () => {
  it('should resolve $expr', () => {
    const fn = () => {};
    fn.$inject = ['$expr'];
    const args = resolveDependencies(fn, 'message' as Expression, null as unknown as Element, (() => {}) as never, makeConfig());
    expect(args).toEqual(['message']);
  });

  it('should resolve $element', () => {
    const el = {} as Element;
    const fn = () => {};
    fn.$inject = ['$element'];
    const args = resolveDependencies(fn, '' as Expression, el, (() => {}) as never, makeConfig());
    expect(args).toEqual([el]);
  });

  it('should resolve $scope via resolveState', () => {
    const scope = { count: 0 };
    const fn = () => {};
    fn.$inject = ['$scope'];
    const args = resolveDependencies(fn, '' as Expression, null as unknown as Element, (() => {}) as never, makeConfig({ resolveState: () => scope }));
    expect(args).toEqual([scope]);
  });

  it('should resolve $mode', () => {
    const fn = () => {};
    fn.$inject = ['$mode'];
    const args = resolveDependencies(fn, '' as Expression, null as unknown as Element, (() => {}) as never, makeConfig({ mode: 'server' }));
    expect(args).toEqual(['server']);
  });

  it('should resolve custom injectables via resolveCustom', () => {
    const service = { fetch: () => {} };
    const fn = () => {};
    fn.$inject = ['myService'];
    const args = resolveDependencies(fn, '' as Expression, null as unknown as Element, (() => {}) as never, makeConfig({
      resolveCustom: (name) => {
        if (name === 'myService') return service;
        return undefined;
      },
    }));
    expect(args).toEqual([service]);
  });

  it('should throw for unknown injectables', () => {
    const fn = () => {};
    fn.$inject = ['unknownThing'];
    expect(() => resolveDependencies(fn, '' as Expression, null as unknown as Element, (() => {}) as never, makeConfig())).toThrow('Unknown injectable: unknownThing');
  });

  it('should return undefined for underscore-prefixed injectables', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = () => {};
    fn.$inject = ['$element', '_unused', '$scope'];
    const scope = { x: 1 };
    const args = resolveDependencies(fn, '' as Expression, null as unknown as Element, (() => {}) as never, makeConfig({ resolveState: () => scope }));
    expect(args).toEqual([expect.any(Object), undefined, scope]);
    expect(warn).toHaveBeenCalledWith("Injectable '_unused' starts with underscore — passing undefined.");
    warn.mockRestore();
  });

  it('should return undefined for underscore-only injectable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = () => {};
    fn.$inject = ['_'];
    const args = resolveDependencies(fn, '' as Expression, null as unknown as Element, (() => {}) as never, makeConfig());
    expect(args).toEqual([undefined]);
    expect(warn).toHaveBeenCalledWith("Injectable '_' starts with underscore — passing undefined.");
    warn.mockRestore();
  });
});
