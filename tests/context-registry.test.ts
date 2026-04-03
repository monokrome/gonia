import { describe, it, expect, beforeEach } from 'vitest';
import { createContextKey, registerContext, requireContext } from '../src/context-registry.js';
import { applyGlobals, cleanupGlobals } from './test-globals.js';

describe('requireContext', () => {
  beforeEach(() => {
    applyGlobals();
  });

  afterEach(() => {
    cleanupGlobals();
  });

  it('should return the value when context exists on an ancestor', () => {
    const Key = createContextKey<string>('test');
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    document.body.appendChild(parent);

    registerContext(parent, Key, 'hello');

    expect(requireContext(child, Key)).toBe('hello');
  });

  it('should return the value when context exists on the element itself with includeSelf', () => {
    const Key = createContextKey<number>('count');
    const el = document.createElement('div');
    document.body.appendChild(el);

    registerContext(el, Key, 42);

    expect(requireContext(el, Key, true)).toBe(42);
  });

  it('should throw with the context name when not found', () => {
    const Key = createContextKey<string>('ThemeContext');
    const el = document.createElement('div');
    document.body.appendChild(el);

    expect(() => requireContext(el, Key)).toThrow(
      'Required context "ThemeContext" not found'
    );
  });

  it('should throw when context exists on element but includeSelf is false', () => {
    const Key = createContextKey<string>('self-only');
    const el = document.createElement('div');
    document.body.appendChild(el);

    registerContext(el, Key, 'value');

    expect(() => requireContext(el, Key, false)).toThrow(
      'Required context "self-only" not found'
    );
  });
});
