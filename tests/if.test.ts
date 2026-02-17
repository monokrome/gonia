import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { cif } from '../src/directives/if.js';
import { createContext } from '../src/context.js';
import { Mode, Expression, EvalFn } from '../src/types.js';
import { reactive } from '../src/reactivity.js';

// Import directives to register them in the global registry
import '../src/directives/text.js';
import '../src/directives/class.js';

describe('g-if directive', () => {
  let document: Document;
  let $eval: EvalFn;

  beforeEach(() => {
    const window = new Window();
    document = window.document as unknown as Document;
  });

  describe('conditional rendering', () => {
    it('should render element when condition is true', () => {
      const state = reactive({ show: true });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      element.textContent = 'Visible';
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      expect(container.querySelectorAll('p').length).toBe(1);
      expect(container.querySelector('p')?.textContent).toBe('Visible');
    });

    it('should not render element when condition is false', () => {
      const state = reactive({ show: false });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      element.textContent = 'Hidden';
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      expect(container.querySelectorAll('p').length).toBe(0);
    });

    it('should handle expression conditions', () => {
      const state = reactive({ items: ['a', 'b', 'c'] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'items.length > 0');
      element.textContent = 'Has items';
      container.appendChild(element);

      cif('items.length > 0' as Expression, element, $eval, state);

      expect(container.querySelectorAll('p').length).toBe(1);
    });

    it('should handle falsy values correctly', () => {
      const state = reactive({ value: 0 });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'value');
      container.appendChild(element);

      cif('value' as Expression, element, $eval, state);

      expect(container.querySelectorAll('p').length).toBe(0);
    });

    it('should handle null/undefined', () => {
      const state = reactive({ value: null as string | null });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'value');
      container.appendChild(element);

      cif('value' as Expression, element, $eval, state);

      expect(container.querySelectorAll('p').length).toBe(0);
    });
  });

  describe('reactivity', () => {
    it('should add element when condition becomes true', () => {
      const state = reactive({ show: false });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      element.textContent = 'Dynamic';
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      expect(container.querySelectorAll('p').length).toBe(0);

      state.show = true;

      expect(container.querySelectorAll('p').length).toBe(1);
      expect(container.querySelector('p')?.textContent).toBe('Dynamic');
    });

    it('should remove element when condition becomes false', () => {
      const state = reactive({ show: true });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      element.textContent = 'Removable';
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      expect(container.querySelectorAll('p').length).toBe(1);

      state.show = false;

      expect(container.querySelectorAll('p').length).toBe(0);
    });

    it('should toggle multiple times', () => {
      const state = reactive({ show: true });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      expect(container.querySelectorAll('p').length).toBe(1);

      state.show = false;
      expect(container.querySelectorAll('p').length).toBe(0);

      state.show = true;
      expect(container.querySelectorAll('p').length).toBe(1);

      state.show = false;
      expect(container.querySelectorAll('p').length).toBe(0);
    });
  });

  describe('nested directives', () => {
    it('should process g-text in conditional element', () => {
      const state = reactive({ show: true, message: 'Hello' });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      element.setAttribute('g-text', 'message');
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      expect(container.querySelector('p')?.textContent).toBe('Hello');
    });

    it('should process g-class in conditional element', () => {
      const state = reactive({ show: true, isActive: true });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      element.setAttribute('g-class', '{ active: isActive }');
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      expect(container.querySelector('p')?.classList.contains('active')).toBe(true);
    });
  });

  describe('comment placeholder', () => {
    it('should insert template placeholder', () => {
      const state = reactive({ show: true });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      const templates = container.querySelectorAll('template[data-g-if]');
      expect(templates.length).toBe(1);
    });

    it('should maintain position with sibling elements', () => {
      const state = reactive({ show: false });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const before = document.createElement('span');
      before.textContent = 'before';
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      element.textContent = 'conditional';
      const after = document.createElement('span');
      after.textContent = 'after';

      container.appendChild(before);
      container.appendChild(element);
      container.appendChild(after);

      cif('show' as Expression, element, $eval, state);

      // Should have: before, template placeholder, after
      expect(container.children.length).toBe(3);
      expect(container.children[0].textContent).toBe('before');
      expect(container.children[1].tagName).toBe('TEMPLATE');
      expect(container.children[2].textContent).toBe('after');

      state.show = true;

      // Should have: before, template placeholder, conditional, after
      expect(container.children.length).toBe(4);
      expect(container.children[0].textContent).toBe('before');
      expect(container.children[1].tagName).toBe('TEMPLATE');
      expect(container.children[2].textContent).toBe('conditional');
      expect(container.children[3].textContent).toBe('after');
    });
  });

  describe('priority', () => {
    it('should have STRUCTURAL_CONDITIONAL priority (higher than STRUCTURAL)', () => {
      expect(cif.priority).toBe(1100);
    });
  });

  describe('scope persistence', () => {
    it('should preserve scope values across toggles', () => {
      const state = reactive({ show: true, counter: 0 });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      element.setAttribute('g-text', 'counter');
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      // Initial render
      expect(container.querySelector('p')?.textContent).toBe('0');

      // Update value while visible
      state.counter = 5;
      expect(container.querySelector('p')?.textContent).toBe('5');

      // Toggle off
      state.show = false;
      expect(container.querySelectorAll('p').length).toBe(0);

      // Toggle on - value should still be 5
      state.show = true;
      expect(container.querySelector('p')?.textContent).toBe('5');

      // Update again
      state.counter = 10;
      expect(container.querySelector('p')?.textContent).toBe('10');

      // Toggle off and on again
      state.show = false;
      state.show = true;
      expect(container.querySelector('p')?.textContent).toBe('10');
    });

    it('should preserve local scope modifications across toggles', () => {
      // This tests that a child scope created by processElementTree
      // maintains values set within the conditional block
      const state = reactive({ show: true, items: ['a', 'b'] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('div');
      element.setAttribute('g-if', 'show');
      element.setAttribute('g-text', 'items.length');
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      expect(container.querySelector('div')?.textContent).toBe('2');

      // Modify parent state while hidden
      state.show = false;
      state.items.push('c');
      state.show = true;

      expect(container.querySelector('div')?.textContent).toBe('3');
    });

    it('should use same placeholder for multiple toggles', () => {
      const state = reactive({ show: true });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      // Get the placeholder
      const placeholder = container.querySelector('template[data-g-if]');
      expect(placeholder).not.toBeNull();

      // Toggle multiple times
      state.show = false;
      state.show = true;
      state.show = false;
      state.show = true;

      // Same placeholder should still be there
      const placeholderAfter = container.querySelector('template[data-g-if]');
      expect(placeholderAfter).toBe(placeholder);
    });

    it('should maintain separate scopes for different g-if blocks', () => {
      const state = reactive({ showA: true, showB: true, value: 'shared' });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');

      const elementA = document.createElement('p');
      elementA.setAttribute('g-if', 'showA');
      elementA.setAttribute('g-text', 'value');
      elementA.id = 'a';

      const elementB = document.createElement('p');
      elementB.setAttribute('g-if', 'showB');
      elementB.setAttribute('g-text', 'value');
      elementB.id = 'b';

      container.appendChild(elementA);
      container.appendChild(elementB);

      cif('showA' as Expression, elementA, $eval, state);
      cif('showB' as Expression, elementB, $eval, state);

      // Both should show the shared value
      expect(container.querySelector('#a')?.textContent).toBe('shared');
      expect(container.querySelector('#b')?.textContent).toBe('shared');

      // Toggle A off
      state.showA = false;
      expect(container.querySelector('#a')).toBeNull();
      expect(container.querySelector('#b')?.textContent).toBe('shared');

      // Modify shared value
      state.value = 'modified';
      expect(container.querySelector('#b')?.textContent).toBe('modified');

      // Toggle A on - should see modified value
      state.showA = true;
      expect(container.querySelector('#a')?.textContent).toBe('modified');
    });

    it('should handle rapid toggles correctly', () => {
      const state = reactive({ show: false });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const element = document.createElement('p');
      element.setAttribute('g-if', 'show');
      element.textContent = 'content';
      container.appendChild(element);

      cif('show' as Expression, element, $eval, state);

      // Rapid toggles
      for (let i = 0; i < 10; i++) {
        state.show = true;
        expect(container.querySelectorAll('p').length).toBe(1);
        state.show = false;
        expect(container.querySelectorAll('p').length).toBe(0);
      }

      // Final state
      state.show = true;
      expect(container.querySelectorAll('p').length).toBe(1);
      expect(container.querySelector('p')?.textContent).toBe('content');
    });

    it('should preserve nested element state across toggles', () => {
      const state = reactive({ show: true, items: [1, 2, 3] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('div');
      const wrapper = document.createElement('div');
      wrapper.setAttribute('g-if', 'show');

      const child1 = document.createElement('span');
      child1.setAttribute('g-text', 'items[0]');
      const child2 = document.createElement('span');
      child2.setAttribute('g-text', 'items[1]');

      wrapper.appendChild(child1);
      wrapper.appendChild(child2);
      container.appendChild(wrapper);

      cif('show' as Expression, wrapper, $eval, state);

      const spans = container.querySelectorAll('span');
      expect(spans[0]?.textContent).toBe('1');
      expect(spans[1]?.textContent).toBe('2');

      // Modify array while visible
      state.items[0] = 100;
      expect(container.querySelectorAll('span')[0]?.textContent).toBe('100');

      // Toggle off and on
      state.show = false;
      state.items[1] = 200;
      state.show = true;

      // Should reflect changes made while hidden
      const spansAfter = container.querySelectorAll('span');
      expect(spansAfter[0]?.textContent).toBe('100');
      expect(spansAfter[1]?.textContent).toBe('200');
    });
  });
});
