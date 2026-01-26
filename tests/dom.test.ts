/**
 * Tests for DOM utilities and context registry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom';
import { findAncestor } from '../src/dom.js';
import {
  createContextKey,
  registerContext,
  resolveContext,
  hasContext,
  removeContext,
  clearContexts
} from '../src/context-registry.js';

describe('findAncestor', () => {
  let document: Document;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
  });

  it('should find ancestor matching predicate', () => {
    const grandparent = document.createElement('div');
    grandparent.setAttribute('data-scope', 'true');
    const parent = document.createElement('div');
    const child = document.createElement('span');

    grandparent.appendChild(parent);
    parent.appendChild(child);
    document.body.appendChild(grandparent);

    const result = findAncestor(child, (el) =>
      el.hasAttribute('data-scope') ? el : undefined
    );

    expect(result).toBe(grandparent);
  });

  it('should return undefined when no ancestor matches', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');

    parent.appendChild(child);
    document.body.appendChild(parent);

    const result = findAncestor(child, (el) =>
      el.hasAttribute('data-nonexistent') ? el : undefined
    );

    expect(result).toBeUndefined();
  });

  it('should find immediate parent', () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-target', 'yes');
    const child = document.createElement('span');

    parent.appendChild(child);
    document.body.appendChild(parent);

    const result = findAncestor(child, (el) =>
      el.hasAttribute('data-target') ? el : undefined
    );

    expect(result).toBe(parent);
  });

  it('should not check self by default', () => {
    const el = document.createElement('div');
    el.setAttribute('data-self', 'true');
    document.body.appendChild(el);

    const result = findAncestor(el, (e) =>
      e.hasAttribute('data-self') ? e : undefined
    );

    expect(result).toBeUndefined();
  });

  it('should check self when includeSelf is true', () => {
    const el = document.createElement('div');
    el.setAttribute('data-self', 'true');
    document.body.appendChild(el);

    const result = findAncestor(el, (e) =>
      e.hasAttribute('data-self') ? e : undefined,
      true
    );

    expect(result).toBe(el);
  });

  it('should return value from WeakMap', () => {
    const dataMap = new WeakMap<Element, string>();
    const parent = document.createElement('div');
    const child = document.createElement('span');

    dataMap.set(parent, 'found-value');
    parent.appendChild(child);
    document.body.appendChild(parent);

    const result = findAncestor(child, (el) => dataMap.get(el));

    expect(result).toBe('found-value');
  });

  it('should find nearest ancestor when multiple match', () => {
    const grandparent = document.createElement('div');
    grandparent.setAttribute('data-level', 'grandparent');
    const parent = document.createElement('div');
    parent.setAttribute('data-level', 'parent');
    const child = document.createElement('span');

    grandparent.appendChild(parent);
    parent.appendChild(child);
    document.body.appendChild(grandparent);

    const result = findAncestor(child, (el) =>
      el.hasAttribute('data-level') ? el.getAttribute('data-level') : undefined
    );

    expect(result).toBe('parent');
  });

  it('should handle element with no parent', () => {
    const el = document.createElement('div');

    const result = findAncestor(el, () => 'value');

    expect(result).toBeUndefined();
  });
});

describe('Context Registry', () => {
  let document: Document;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
    // No need to clear contexts globally - each test creates new elements
    // and WeakMap automatically frees entries when elements are GC'd
  });

  describe('createContextKey', () => {
    it('should create a unique context key', () => {
      const key1 = createContextKey<string>('test');
      const key2 = createContextKey<string>('test');

      expect(key1.name).toBe('test');
      expect(key2.name).toBe('test');
      // Same name but different symbols
      expect(key1.id).not.toBe(key2.id);
    });
  });

  describe('registerContext and resolveContext', () => {
    it('should register and resolve context on an element', () => {
      const key = createContextKey<string>('message');
      const el = document.createElement('div');
      document.body.appendChild(el);

      registerContext(el, key, 'hello');

      const child = document.createElement('span');
      el.appendChild(child);

      const result = resolveContext(child, key);
      expect(result).toBe('hello');
    });

    it('should resolve context from nearest ancestor', () => {
      const key = createContextKey<number>('count');
      const grandparent = document.createElement('div');
      const parent = document.createElement('div');
      const child = document.createElement('span');

      grandparent.appendChild(parent);
      parent.appendChild(child);
      document.body.appendChild(grandparent);

      registerContext(grandparent, key, 100);
      registerContext(parent, key, 200);

      const result = resolveContext(child, key);
      expect(result).toBe(200);
    });

    it('should return undefined when context not found', () => {
      const key = createContextKey<string>('missing');
      const el = document.createElement('div');
      document.body.appendChild(el);

      const result = resolveContext(el, key);
      expect(result).toBeUndefined();
    });

    it('should not include self by default', () => {
      const key = createContextKey<string>('self');
      const el = document.createElement('div');
      document.body.appendChild(el);

      registerContext(el, key, 'value');

      const result = resolveContext(el, key);
      expect(result).toBeUndefined();
    });

    it('should include self when includeSelf is true', () => {
      const key = createContextKey<string>('self');
      const el = document.createElement('div');
      document.body.appendChild(el);

      registerContext(el, key, 'value');

      const result = resolveContext(el, key, true);
      expect(result).toBe('value');
    });
  });

  describe('hasContext', () => {
    it('should return true when context exists', () => {
      const key = createContextKey<string>('exists');
      const el = document.createElement('div');

      registerContext(el, key, 'test');

      expect(hasContext(el, key)).toBe(true);
    });

    it('should return false when context does not exist', () => {
      const key = createContextKey<string>('missing');
      const el = document.createElement('div');

      expect(hasContext(el, key)).toBe(false);
    });

    it('should return false for different key with same name', () => {
      const key1 = createContextKey<string>('name');
      const key2 = createContextKey<string>('name');
      const el = document.createElement('div');

      registerContext(el, key1, 'value');

      expect(hasContext(el, key1)).toBe(true);
      expect(hasContext(el, key2)).toBe(false);
    });
  });

  describe('removeContext', () => {
    it('should remove registered context', () => {
      const key = createContextKey<string>('removable');
      const el = document.createElement('div');

      registerContext(el, key, 'test');
      expect(hasContext(el, key)).toBe(true);

      removeContext(el, key);
      expect(hasContext(el, key)).toBe(false);
    });

    it('should not throw when removing non-existent context', () => {
      const key = createContextKey<string>('missing');
      const el = document.createElement('div');

      expect(() => removeContext(el, key)).not.toThrow();
    });
  });

  describe('clearContexts', () => {
    it('should clear all contexts from a specific element', () => {
      const key1 = createContextKey<string>('one');
      const key2 = createContextKey<number>('two');
      const el = document.createElement('div');

      registerContext(el, key1, 'value1');
      registerContext(el, key2, 42);

      expect(hasContext(el, key1)).toBe(true);
      expect(hasContext(el, key2)).toBe(true);

      clearContexts(el);

      expect(hasContext(el, key1)).toBe(false);
      expect(hasContext(el, key2)).toBe(false);
    });

    it('should not affect contexts on other elements', () => {
      const key = createContextKey<string>('shared');
      const el1 = document.createElement('div');
      const el2 = document.createElement('span');

      registerContext(el1, key, 'value1');
      registerContext(el2, key, 'value2');

      clearContexts(el1);

      expect(hasContext(el1, key)).toBe(false);
      expect(hasContext(el2, key)).toBe(true);
    });
  });

  describe('typed context values', () => {
    it('should preserve complex object types', () => {
      interface UserContext {
        name: string;
        age: number;
      }

      const UserKey = createContextKey<UserContext>('user');
      const parent = document.createElement('div');
      const child = document.createElement('span');

      parent.appendChild(child);
      document.body.appendChild(parent);

      registerContext(parent, UserKey, { name: 'Alice', age: 30 });

      const user = resolveContext(child, UserKey);
      expect(user).toEqual({ name: 'Alice', age: 30 });
    });

    it('should work with Map values', () => {
      const MapKey = createContextKey<Map<string, string>>('slots');
      const parent = document.createElement('div');
      const child = document.createElement('span');

      parent.appendChild(child);
      document.body.appendChild(parent);

      const slots = new Map([['default', '<p>content</p>']]);
      registerContext(parent, MapKey, slots);

      const resolved = resolveContext(child, MapKey);
      expect(resolved?.get('default')).toBe('<p>content</p>');
    });
  });
});
