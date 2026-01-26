/**
 * Tests for DOM utilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom';
import { findAncestor } from '../src/dom.js';

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
