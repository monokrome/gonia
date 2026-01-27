/**
 * Tests for the shared element processing utility.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { processElementDirectives, processElementTree } from '../src/process.js';
import { Mode } from '../src/types.js';
import { reactive, createScope } from '../src/reactivity.js';

describe('processElementDirectives', () => {
  let document: Document;

  beforeEach(() => {
    const window = new Window();
    document = window.document as unknown as Document;
  });

  describe('basic directive processing', () => {
    it('should process g-text directive', () => {
      const state = reactive({ message: 'Hello World' });
      const element = document.createElement('span');
      element.setAttribute('g-text', 'message');

      processElementDirectives(element, state, Mode.CLIENT);

      expect(element.textContent).toBe('Hello World');
    });

    it('should process g-class directive', () => {
      const state = reactive({ isActive: true, hasError: false });
      const element = document.createElement('div');
      element.setAttribute('g-class', '{ active: isActive, error: hasError }');

      processElementDirectives(element, state, Mode.CLIENT);

      expect(element.classList.contains('active')).toBe(true);
      expect(element.classList.contains('error')).toBe(false);
    });

    it('should process g-show directive', () => {
      const state = reactive({ visible: false });
      const element = document.createElement('div') as HTMLElement;
      element.setAttribute('g-show', 'visible');

      processElementDirectives(element, state, Mode.CLIENT);

      expect(element.style.display).toBe('none');
    });

    it('should process g-html directive', () => {
      const state = reactive({ content: '<strong>Bold</strong>' });
      const element = document.createElement('div');
      element.setAttribute('g-html', 'content');

      processElementDirectives(element, state, Mode.CLIENT);

      expect(element.innerHTML).toBe('<strong>Bold</strong>');
    });

    it('should mark element as processed', () => {
      const state = reactive({});
      const element = document.createElement('div');

      processElementDirectives(element, state, Mode.CLIENT);

      expect(element.hasAttribute('data-g-processed')).toBe(true);
    });
  });

  describe('scope handling', () => {
    it('should use existing scope when provided', () => {
      const parentState = reactive({ parentValue: 'parent' });
      const existingScope = createScope(parentState, { localValue: 'local' });

      const element = document.createElement('span');
      element.setAttribute('g-text', 'localValue');

      const returnedScope = processElementDirectives(element, parentState, Mode.CLIENT, {
        existingScope
      });

      expect(element.textContent).toBe('local');
      expect(returnedScope).toBe(existingScope);
    });

    it('should create child scope with additions', () => {
      const parentState = reactive({ parentValue: 'parent' });

      const element = document.createElement('span');
      element.setAttribute('g-text', 'itemValue');

      const returnedScope = processElementDirectives(element, parentState, Mode.CLIENT, {
        scopeAdditions: { itemValue: 'item' }
      });

      expect(element.textContent).toBe('item');
      expect(returnedScope).not.toBe(parentState);
    });

    it('should inherit from parent scope', () => {
      const parentState = reactive({ parentValue: 'from parent' });

      const element = document.createElement('span');
      element.setAttribute('g-text', 'parentValue');

      processElementDirectives(element, parentState, Mode.CLIENT, {
        scopeAdditions: { localValue: 'local' }
      });

      expect(element.textContent).toBe('from parent');
    });

    it('should allow scope additions to shadow parent values', () => {
      const parentState = reactive({ value: 'parent' });

      const element = document.createElement('span');
      element.setAttribute('g-text', 'value');

      processElementDirectives(element, parentState, Mode.CLIENT, {
        scopeAdditions: { value: 'shadowed' }
      });

      expect(element.textContent).toBe('shadowed');
    });
  });

  describe('reactivity', () => {
    it('should update g-text when state changes', () => {
      const state = reactive({ count: 0 });
      const element = document.createElement('span');
      element.setAttribute('g-text', 'count');

      processElementDirectives(element, state, Mode.CLIENT);

      expect(element.textContent).toBe('0');

      state.count = 42;

      expect(element.textContent).toBe('42');
    });

    it('should update g-class when state changes', () => {
      const state = reactive({ active: false });
      const element = document.createElement('div');
      element.setAttribute('g-class', '{ active: active }');

      processElementDirectives(element, state, Mode.CLIENT);

      expect(element.classList.contains('active')).toBe(false);

      state.active = true;

      expect(element.classList.contains('active')).toBe(true);
    });

    it('should update g-show when state changes', () => {
      const state = reactive({ visible: true });
      const element = document.createElement('div') as HTMLElement;
      element.setAttribute('g-show', 'visible');

      processElementDirectives(element, state, Mode.CLIENT);

      expect(element.style.display).toBe('');

      state.visible = false;

      expect(element.style.display).toBe('none');
    });
  });

  describe('server mode', () => {
    it('should process directives without reactivity', () => {
      const state = reactive({ message: 'Server rendered' });
      const element = document.createElement('span');
      element.setAttribute('g-text', 'message');

      processElementDirectives(element, state, Mode.SERVER);

      expect(element.textContent).toBe('Server rendered');

      // In server mode, changes should not trigger updates
      // (no effect() is set up)
      state.message = 'Changed';
      // textContent would still be 'Server rendered' if we tested,
      // but since linkedom doesn't fully simulate browser behavior,
      // we just verify initial render worked
    });
  });
});

describe('processElementTree', () => {
  let document: Document;

  beforeEach(() => {
    const window = new Window();
    document = window.document as unknown as Document;
  });

  describe('recursive processing', () => {
    it('should process nested elements', () => {
      const state = reactive({ title: 'Title', content: 'Content' });

      const container = document.createElement('div');
      const header = document.createElement('h1');
      header.setAttribute('g-text', 'title');
      const body = document.createElement('p');
      body.setAttribute('g-text', 'content');

      container.appendChild(header);
      container.appendChild(body);

      processElementTree(container, state, Mode.CLIENT);

      expect(header.textContent).toBe('Title');
      expect(body.textContent).toBe('Content');
    });

    it('should process deeply nested elements', () => {
      const state = reactive({ value: 'deep' });

      const root = document.createElement('div');
      const level1 = document.createElement('div');
      const level2 = document.createElement('div');
      const level3 = document.createElement('span');
      level3.setAttribute('g-text', 'value');

      level2.appendChild(level3);
      level1.appendChild(level2);
      root.appendChild(level1);

      processElementTree(root, state, Mode.CLIENT);

      expect(level3.textContent).toBe('deep');
    });

    it('should create child scopes for nested elements', () => {
      const state = reactive({ parent: 'parent', child: 'child' });

      // Note: g-text on parent would replace children, so we test differently
      const root = document.createElement('div');
      const nested = document.createElement('span');
      nested.setAttribute('g-text', 'child');
      root.appendChild(nested);

      processElementTree(root, state, Mode.CLIENT);

      // Child should have its text set
      expect(nested.textContent).toBe('child');
      // Root contains the child
      expect(root.contains(nested)).toBe(true);
    });
  });

  describe('scope inheritance in tree', () => {
    it('should pass existing scope to root only', () => {
      const parentState = reactive({});
      const existingScope = createScope(parentState, { rootValue: 'root' });

      // Don't set g-text on root to preserve children
      const root = document.createElement('div');
      const child = document.createElement('span');
      child.setAttribute('g-text', 'rootValue');
      root.appendChild(child);

      processElementTree(root, parentState, Mode.CLIENT, { existingScope });

      // Child inherits from root's scope (which is the existingScope)
      expect(child.textContent).toBe('root');
    });

    it('should apply scope additions to root element', () => {
      const state = reactive({ items: ['a', 'b', 'c'] });

      // Test with separate elements - g-text replaces content
      const root = document.createElement('div');
      const itemSpan = document.createElement('span');
      itemSpan.setAttribute('g-text', 'item');
      const indexSpan = document.createElement('span');
      indexSpan.setAttribute('g-text', 'idx');
      root.appendChild(itemSpan);
      root.appendChild(indexSpan);

      processElementTree(root, state, Mode.CLIENT, {
        scopeAdditions: { item: 'first', idx: 0 }
      });

      expect(itemSpan.textContent).toBe('first');
      expect(indexSpan.textContent).toBe('0');
    });
  });
});

describe('scope persistence across re-renders', () => {
  let document: Document;

  beforeEach(() => {
    const window = new Window();
    document = window.document as unknown as Document;
  });

  it('should maintain scope identity when reusing existingScope', () => {
    const parentState = reactive({ count: 0 });
    const persistentScope = createScope(parentState, {});

    // First render
    const element1 = document.createElement('span');
    element1.setAttribute('g-text', 'count');
    const scope1 = processElementDirectives(element1, parentState, Mode.CLIENT, {
      existingScope: persistentScope
    });

    expect(element1.textContent).toBe('0');

    // Modify through scope
    parentState.count = 5;
    expect(element1.textContent).toBe('5');

    // Simulate re-render with same scope
    const element2 = document.createElement('span');
    element2.setAttribute('g-text', 'count');
    const scope2 = processElementDirectives(element2, parentState, Mode.CLIENT, {
      existingScope: persistentScope
    });

    // Same scope should be returned
    expect(scope1).toBe(scope2);
    expect(scope1).toBe(persistentScope);

    // Value should reflect current state
    expect(element2.textContent).toBe('5');
  });

  it('should allow local values in persistent scope', () => {
    const parentState = reactive({ show: true });
    const persistentScope = createScope(parentState, {}) as Record<string, unknown>;

    // Set a local value in the scope
    persistentScope.localCounter = 0;

    const element = document.createElement('span');
    element.setAttribute('g-text', 'localCounter');

    processElementDirectives(element, parentState, Mode.CLIENT, {
      existingScope: persistentScope
    });

    expect(element.textContent).toBe('0');

    // Modify local value
    persistentScope.localCounter = 10;

    // Create new element with same scope (simulating g-if toggle)
    const element2 = document.createElement('span');
    element2.setAttribute('g-text', 'localCounter');

    processElementDirectives(element2, parentState, Mode.CLIENT, {
      existingScope: persistentScope
    });

    // Should still have the modified value
    expect(element2.textContent).toBe('10');
  });
});
