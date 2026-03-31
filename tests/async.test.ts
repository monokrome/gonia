import { describe, it, expect, beforeEach } from 'vitest';
import { isAsyncFunction, FallbackSignal } from '../src/async.js';

describe('isAsyncFunction', () => {
  it('should return true for async functions', () => {
    const fn = async () => {};
    expect(isAsyncFunction(fn)).toBe(true);
  });

  it('should return true for async named functions', () => {
    async function myFunc() {}
    expect(isAsyncFunction(myFunc)).toBe(true);
  });

  it('should return false for regular functions', () => {
    const fn = () => {};
    expect(isAsyncFunction(fn)).toBe(false);
  });

  it('should return false for regular named functions', () => {
    function myFunc() {}
    expect(isAsyncFunction(myFunc)).toBe(false);
  });

  it('should return false for functions that return a promise', () => {
    const fn = () => Promise.resolve();
    expect(isAsyncFunction(fn)).toBe(false);
  });
});

describe('FallbackSignal', () => {
  it('should be identifiable via instanceof', () => {
    const signal = new FallbackSignal();
    expect(signal).toBeInstanceOf(FallbackSignal);
    expect(signal.isFallbackSignal).toBe(true);
  });

  it('should not be an instance of Error', () => {
    const signal = new FallbackSignal();
    expect(signal).not.toBeInstanceOf(Error);
  });
});
