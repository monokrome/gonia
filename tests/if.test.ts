import { describe, it, expect, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom';
import { cif } from '../src/directives/if.js';
import { createContext } from '../src/context.js';
import { Mode, Expression, EvalFn } from '../src/types.js';
import { reactive } from '../src/reactivity.js';

describe('g-if directive', () => {
  let document: Document;
  let $eval: EvalFn;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
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
    it('should have STRUCTURAL priority', () => {
      expect(cif.priority).toBe(1000);
    });
  });
});
