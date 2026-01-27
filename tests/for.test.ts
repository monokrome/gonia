import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { cfor } from '../src/directives/for.js';
import { createContext } from '../src/context.js';
import { Mode, Expression, EvalFn } from '../src/types.js';
import { reactive } from '../src/reactivity.js';

describe('g-for directive', () => {
  let document: Document;
  let $eval: EvalFn;

  beforeEach(() => {
    const window = new Window();
    document = window.document as unknown as Document;
  });

  describe('array iteration', () => {
    it('should render items from array', () => {
      const state = reactive({ items: ['a', 'b', 'c'] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'item in items');
      template.setAttribute('g-text', 'item');
      container.appendChild(template);

      cfor('item in items' as Expression, template, $eval, state);

      expect(container.querySelectorAll('li').length).toBe(3);
      const items = container.querySelectorAll('li');
      expect(items[0].textContent).toBe('a');
      expect(items[1].textContent).toBe('b');
      expect(items[2].textContent).toBe('c');
    });

    it('should render items with index', () => {
      const state = reactive({ items: ['a', 'b', 'c'] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', '(item, index) in items');
      template.setAttribute('g-text', "index + ': ' + item");
      container.appendChild(template);

      cfor('(item, index) in items' as Expression, template, $eval, state);

      const items = container.querySelectorAll('li');
      expect(items[0].textContent).toBe('0: a');
      expect(items[1].textContent).toBe('1: b');
      expect(items[2].textContent).toBe('2: c');
    });

    it('should handle empty array', () => {
      const state = reactive({ items: [] as string[] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'item in items');
      template.setAttribute('g-text', 'item');
      container.appendChild(template);

      cfor('item in items' as Expression, template, $eval, state);

      expect(container.querySelectorAll('li').length).toBe(0);
    });

    it('should handle null array', () => {
      const state = reactive({ items: null as string[] | null });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'item in items');
      template.setAttribute('g-text', 'item');
      container.appendChild(template);

      cfor('item in items' as Expression, template, $eval, state);

      expect(container.querySelectorAll('li').length).toBe(0);
    });
  });

  describe('object iteration', () => {
    it('should iterate over object entries', () => {
      const state = reactive({ obj: { a: 1, b: 2, c: 3 } });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', '(value, key) in obj');
      template.setAttribute('g-text', "key + '=' + value");
      container.appendChild(template);

      cfor('(value, key) in obj' as Expression, template, $eval, state);

      const items = container.querySelectorAll('li');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('a=1');
      expect(items[1].textContent).toBe('b=2');
      expect(items[2].textContent).toBe('c=3');
    });
  });

  describe('reactivity', () => {
    it('should update when array changes', () => {
      const state = reactive({ items: ['a', 'b'] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'item in items');
      template.setAttribute('g-text', 'item');
      container.appendChild(template);

      cfor('item in items' as Expression, template, $eval, state);

      expect(container.querySelectorAll('li').length).toBe(2);

      state.items = ['a', 'b', 'c', 'd'];

      expect(container.querySelectorAll('li').length).toBe(4);
    });

    it('should update when array is cleared', () => {
      const state = reactive({ items: ['a', 'b', 'c'] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'item in items');
      template.setAttribute('g-text', 'item');
      container.appendChild(template);

      cfor('item in items' as Expression, template, $eval, state);

      expect(container.querySelectorAll('li').length).toBe(3);

      state.items = [];

      expect(container.querySelectorAll('li').length).toBe(0);
    });
  });

  describe('nested directives', () => {
    it('should process g-class in loop items', () => {
      const state = reactive({
        items: [
          { name: 'a', active: true },
          { name: 'b', active: false }
        ]
      });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'item in items');
      template.setAttribute('g-text', 'item.name');
      template.setAttribute('g-class', '{ active: item.active }');
      container.appendChild(template);

      cfor('item in items' as Expression, template, $eval, state);

      const items = container.querySelectorAll('li');
      expect(items[0].classList.contains('active')).toBe(true);
      expect(items[1].classList.contains('active')).toBe(false);
    });

    it('should process g-show in loop items', () => {
      const state = reactive({
        items: [
          { name: 'visible', show: true },
          { name: 'hidden', show: false }
        ]
      });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'item in items');
      template.setAttribute('g-text', 'item.name');
      template.setAttribute('g-show', 'item.show');
      container.appendChild(template);

      cfor('item in items' as Expression, template, $eval, state);

      const items = container.querySelectorAll('li') as NodeListOf<HTMLLIElement>;
      expect(items[0].style.display).toBe('');
      expect(items[1].style.display).toBe('none');
    });
  });

  describe('complex objects', () => {
    it('should render array of objects', () => {
      const state = reactive({
        todos: [
          { id: 1, text: 'First', done: false },
          { id: 2, text: 'Second', done: true },
          { id: 3, text: 'Third', done: false }
        ]
      });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'todo in todos');
      template.setAttribute('g-text', 'todo.text');
      template.setAttribute('g-class', '{ done: todo.done }');
      container.appendChild(template);

      cfor('todo in todos' as Expression, template, $eval, state);

      const items = container.querySelectorAll('li');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('First');
      expect(items[1].textContent).toBe('Second');
      expect(items[2].textContent).toBe('Third');
      expect(items[1].classList.contains('done')).toBe(true);
    });
  });

  describe('expression parsing', () => {
    it('should handle simple item in items', () => {
      const state = reactive({ items: ['a'] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'item in items');
      template.setAttribute('g-text', 'item');
      container.appendChild(template);

      cfor('item in items' as Expression, template, $eval, state);

      expect(container.querySelectorAll('li').length).toBe(1);
    });

    it('should handle (item) in items with parentheses', () => {
      const state = reactive({ items: ['a'] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', '(item) in items');
      template.setAttribute('g-text', 'item');
      container.appendChild(template);

      cfor('(item) in items' as Expression, template, $eval, state);

      expect(container.querySelectorAll('li').length).toBe(1);
    });

    it('should handle nested property paths', () => {
      const state = reactive({ data: { items: ['a', 'b'] } });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'item in data.items');
      template.setAttribute('g-text', 'item');
      container.appendChild(template);

      cfor('item in data.items' as Expression, template, $eval, state);

      expect(container.querySelectorAll('li').length).toBe(2);
    });
  });

  describe('template element wrapper', () => {
    it('should wrap original element in template element', () => {
      const state = reactive({ items: ['a'] });
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);

      const container = document.createElement('ul');
      const template = document.createElement('li');
      template.setAttribute('g-for', 'item in items');
      container.appendChild(template);

      cfor('item in items' as Expression, template, $eval, state, Mode.CLIENT);

      // Should have a template element with g-for attribute
      const templateEl = container.querySelector('template[g-for]');
      expect(templateEl).not.toBeNull();
      expect(templateEl?.getAttribute('g-for')).toBe('item in items');

      // Should have rendered the item
      const items = container.querySelectorAll('li');
      expect(items.length).toBe(1);
    });
  });
});
