import { describe, it, expect, beforeEach } from 'vitest';
import { isAsyncFunction, generateAsyncId, resetAsyncIdCounter } from '../src/async.js';

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

describe('generateAsyncId', () => {
  beforeEach(() => {
    resetAsyncIdCounter();
  });

  it('should generate sequential IDs', () => {
    expect(generateAsyncId()).toBe('g-async-0');
    expect(generateAsyncId()).toBe('g-async-1');
    expect(generateAsyncId()).toBe('g-async-2');
  });

  it('should reset counter', () => {
    generateAsyncId();
    generateAsyncId();
    resetAsyncIdCounter();
    expect(generateAsyncId()).toBe('g-async-0');
  });
});
