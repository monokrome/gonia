import { describe, it, expect, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom';
import {
  template,
  findTemplateAncestor,
  getSavedContent,
  getEffectScope
} from '../src/directives/template.js';
import { createMemoryRegistry } from '../src/templates.js';
import { Expression, DirectivePriority } from '../src/types.js';

describe('findTemplateAncestor', () => {
  let document: Document;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
  });

  it('should return null when element has no parent', () => {
    const el = document.createElement('div');
    expect(findTemplateAncestor(el)).toBeNull();
  });

  it('should return null when no ancestor has saved content', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    document.body.appendChild(parent);

    expect(findTemplateAncestor(child)).toBeNull();
  });

  it('should find immediate parent with saved content', async () => {
    const templates = createMemoryRegistry({
      test: '<slot></slot>'
    });

    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    document.body.appendChild(parent);

    // Execute directive to save content
    await template('test' as Expression, parent, templates);

    // Now child should be inside the template content, but parent has saved content
    const newChild = parent.querySelector('slot') || document.createElement('span');
    parent.appendChild(newChild);

    expect(findTemplateAncestor(newChild)).toBe(parent);
  });

  it('should find grandparent with saved content', async () => {
    const templates = createMemoryRegistry({
      outer: '<div class="inner"><slot></slot></div>'
    });

    const grandparent = document.createElement('div');
    document.body.appendChild(grandparent);

    await template('outer' as Expression, grandparent, templates);

    // Find the nested slot
    const inner = grandparent.querySelector('.inner');
    const slot = grandparent.querySelector('slot');

    if (slot) {
      expect(findTemplateAncestor(slot)).toBe(grandparent);
    }
  });
});

describe('getSavedContent', () => {
  let document: Document;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
  });

  it('should return undefined for element without saved content', () => {
    const el = document.createElement('div');
    expect(getSavedContent(el)).toBeUndefined();
  });

  it('should return saved content after directive execution', async () => {
    const templates = createMemoryRegistry({
      card: '<div class="card"><slot></slot></div>'
    });

    const el = document.createElement('div');
    el.innerHTML = '<p>Original content</p>';
    document.body.appendChild(el);

    await template('card' as Expression, el, templates);

    const content = getSavedContent(el);
    expect(content).toBeDefined();
    expect(content?.slots.get('default')).toBe('<p>Original content</p>');
  });

  it('should save named slot content separately', async () => {
    const templates = createMemoryRegistry({
      layout: '<header><slot name="title"></slot></header><main><slot></slot></main>'
    });

    const el = document.createElement('div');
    el.innerHTML = '<h1 slot="title">Title</h1><p>Body</p>';
    document.body.appendChild(el);

    await template('layout' as Expression, el, templates);

    const content = getSavedContent(el);
    expect(content?.slots.get('title')).toBe('<h1 slot="title">Title</h1>');
    expect(content?.slots.get('default')).toBe('<p>Body</p>');
  });

  it('should handle multiple elements in same slot', async () => {
    const templates = createMemoryRegistry({
      list: '<ul><slot></slot></ul>'
    });

    const el = document.createElement('div');
    el.innerHTML = '<li>One</li><li>Two</li><li>Three</li>';
    document.body.appendChild(el);

    await template('list' as Expression, el, templates);

    const content = getSavedContent(el);
    expect(content?.slots.get('default')).toBe('<li>One</li><li>Two</li><li>Three</li>');
  });

  it('should handle text nodes in default slot', async () => {
    const templates = createMemoryRegistry({
      wrapper: '<span><slot></slot></span>'
    });

    const el = document.createElement('div');
    el.textContent = 'Plain text content';
    document.body.appendChild(el);

    await template('wrapper' as Expression, el, templates);

    const content = getSavedContent(el);
    expect(content?.slots.get('default')).toBe('Plain text content');
  });

  it('should ignore whitespace-only text nodes', async () => {
    const templates = createMemoryRegistry({
      box: '<div><slot></slot></div>'
    });

    const el = document.createElement('div');
    el.innerHTML = '   \n   ';
    document.body.appendChild(el);

    await template('box' as Expression, el, templates);

    const content = getSavedContent(el);
    expect(content?.slots.has('default')).toBe(false);
  });

  it('should ignore comment nodes', async () => {
    const templates = createMemoryRegistry({
      box: '<div><slot></slot></div>'
    });

    const el = document.createElement('div');
    el.innerHTML = '<!-- comment --><p>Content</p>';
    document.body.appendChild(el);

    await template('box' as Expression, el, templates);

    const content = getSavedContent(el);
    expect(content?.slots.get('default')).toBe('<p>Content</p>');
  });
});

describe('template directive', () => {
  let document: Document;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
  });

  it('should have TEMPLATE priority', () => {
    expect(template.priority).toBe(DirectivePriority.TEMPLATE);
  });

  it('should have transclude flag set', () => {
    expect(template.transclude).toBe(true);
  });

  it('should replace element content with template', async () => {
    const templates = createMemoryRegistry({
      simple: '<p>Template content</p>'
    });

    const el = document.createElement('div');
    el.innerHTML = '<span>Original</span>';
    document.body.appendChild(el);

    await template('simple' as Expression, el, templates);

    expect(el.innerHTML).toBe('<p>Template content</p>');
  });

  it('should handle empty templates', async () => {
    const templates = createMemoryRegistry({
      empty: ''
    });

    const el = document.createElement('div');
    el.innerHTML = '<span>Original</span>';
    document.body.appendChild(el);

    await template('empty' as Expression, el, templates);

    expect(el.innerHTML).toBe('');
  });

  it('should detect simple cycles', async () => {
    const consoleError = console.error;
    const errors: string[] = [];
    console.error = (msg: string) => errors.push(msg);

    const templates = createMemoryRegistry({
      recursive: '<div g-template="recursive"></div>'
    });

    const el = document.createElement('div');
    document.body.appendChild(el);

    // First render
    await template('recursive' as Expression, el, templates);

    // Simulate processing the nested template directive
    const nested = el.querySelector('[g-template]');
    if (nested) {
      await template('recursive' as Expression, nested as Element, templates);
    }

    console.error = consoleError;
    expect(errors.some(e => e.includes('Cycle detected'))).toBe(true);
  });

  it('should create effect scope for element', async () => {
    const templates = createMemoryRegistry({
      scoped: '<span>Scoped</span>'
    });

    const el = document.createElement('div');
    document.body.appendChild(el);

    await template('scoped' as Expression, el, templates);

    const scope = getEffectScope(el);
    expect(scope).toBeDefined();
    expect(scope?.active).toBe(true);
  });

  it('should stop previous scope on re-render', async () => {
    const templates = createMemoryRegistry({
      rerender: '<span>Content</span>'
    });

    const el = document.createElement('div');
    document.body.appendChild(el);

    await template('rerender' as Expression, el, templates);
    const firstScope = getEffectScope(el);

    await template('rerender' as Expression, el, templates);
    const secondScope = getEffectScope(el);

    expect(firstScope?.active).toBe(false);
    expect(secondScope?.active).toBe(true);
  });
});

describe('getEffectScope (template.ts)', () => {
  let document: Document;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
  });

  it('should return undefined for element without scope', () => {
    const el = document.createElement('div');
    expect(getEffectScope(el)).toBeUndefined();
  });
});
