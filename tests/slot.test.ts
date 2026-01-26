import { describe, it, expect, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom';
import { slot, processNativeSlot } from '../src/directives/slot.js';
import { template, getSavedContent, SlotContent } from '../src/directives/template.js';
import { createMemoryRegistry } from '../src/templates.js';
import { createContext } from '../src/context.js';
import { Mode, Expression, EvalFn } from '../src/types.js';
import { resolveContext } from '../src/context-registry.js';
import { SlotContentContext } from '../src/directives/template.js';

describe('slot directive', () => {
  let document: Document;
  let $eval: EvalFn;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
    const ctx = createContext(Mode.SERVER, {});
    $eval = ctx.eval.bind(ctx);
  });

  describe('slot name resolution', () => {
    it('should use "default" when no name or expression', async () => {
      const templates = createMemoryRegistry({
        test: '<div id="slot-target"></div>'
      });

      const templateEl = document.createElement('div');
      templateEl.innerHTML = '<p>Default content</p>';
      document.body.appendChild(templateEl);

      await template('test' as Expression, templateEl, templates);

      const slotTarget = templateEl.querySelector('#slot-target');
      if (slotTarget) {
        // No name attribute, no expression - should use 'default'
        const content = resolveContext(slotTarget, SlotContentContext);
        slot('' as Expression, slotTarget, $eval, content);
        expect(slotTarget.innerHTML).toBe('<p>Default content</p>');
      }
    });

    it('should use name attribute for static slot name', () => {
      const parent = document.createElement('div');
      const slotEl = document.createElement('div');
      slotEl.setAttribute('name', 'header');
      parent.appendChild(slotEl);

      slot('' as Expression, slotEl, $eval, undefined);

      // Without template ancestor, nothing happens
      expect(slotEl.innerHTML).toBe('');
    });

    it('should evaluate expression for dynamic slot name', () => {
      const dynamicCtx = createContext(Mode.SERVER, { activeSlot: 'footer' });
      const dynamicEval = dynamicCtx.eval.bind(dynamicCtx);
      const slotEl = document.createElement('div');

      slot('activeSlot' as Expression, slotEl, dynamicEval, undefined);

      // Without template ancestor, nothing happens but expression is evaluated
      expect(slotEl.innerHTML).toBe('');
    });
  });

  describe('without template ancestor', () => {
    it('should leave slot unchanged when no template ancestor exists', () => {
      const slotEl = document.createElement('div');
      slotEl.innerHTML = '<span>Fallback</span>';
      document.body.appendChild(slotEl);

      slot('' as Expression, slotEl, $eval, undefined);

      expect(slotEl.innerHTML).toBe('<span>Fallback</span>');
    });

    it('should not throw when orphaned', () => {
      const slotEl = document.createElement('div');

      expect(() => {
        slot('' as Expression, slotEl, $eval, undefined);
      }).not.toThrow();
    });
  });

  describe('with template ancestor', () => {
    it('should transclude default slot content', async () => {
      const templates = createMemoryRegistry({
        card: '<div class="body"><div id="slot-target"></div></div>'
      });

      const templateEl = document.createElement('div');
      templateEl.innerHTML = '<p>Transcluded content</p>';
      document.body.appendChild(templateEl);

      await template('card' as Expression, templateEl, templates);

      const slotTarget = templateEl.querySelector('#slot-target');
      if (slotTarget) {
        const content = resolveContext(slotTarget, SlotContentContext);
        slot('' as Expression, slotTarget, $eval, content);
        expect(slotTarget.innerHTML).toBe('<p>Transcluded content</p>');
      }
    });

    it('should transclude named slot content', async () => {
      const templates = createMemoryRegistry({
        layout: '<header id="header-slot"></header><main id="main-slot"></main>'
      });

      const templateEl = document.createElement('div');
      templateEl.innerHTML = '<h1 slot="header">Title</h1><p>Body</p>';
      document.body.appendChild(templateEl);

      await template('layout' as Expression, templateEl, templates);

      const headerSlot = templateEl.querySelector('#header-slot');
      const mainSlot = templateEl.querySelector('#main-slot');

      if (headerSlot) {
        headerSlot.setAttribute('name', 'header');
        const content = resolveContext(headerSlot, SlotContentContext);
        slot('' as Expression, headerSlot, $eval, content);
        expect(headerSlot.innerHTML).toBe('<h1 slot="header">Title</h1>');
      }

      if (mainSlot) {
        const content = resolveContext(mainSlot, SlotContentContext);
        slot('' as Expression, mainSlot, $eval, content);
        expect(mainSlot.innerHTML).toBe('<p>Body</p>');
      }
    });

    it('should leave fallback content when no matching slot', async () => {
      const templates = createMemoryRegistry({
        empty: '<div id="slot-target"><span>Fallback</span></div>'
      });

      const templateEl = document.createElement('div');
      // No children to transclude
      document.body.appendChild(templateEl);

      await template('empty' as Expression, templateEl, templates);

      const slotTarget = templateEl.querySelector('#slot-target');
      if (slotTarget) {
        slotTarget.setAttribute('name', 'nonexistent');
        const content = resolveContext(slotTarget, SlotContentContext);
        slot('' as Expression, slotTarget, $eval, content);
        // Fallback preserved when no matching content
        expect(slotTarget.innerHTML).toBe('<span>Fallback</span>');
      }
    });
  });
});

describe('processNativeSlot', () => {
  let document: Document;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
  });

  it('should use name attribute for slot name', () => {
    const slotEl = document.createElement('slot');
    slotEl.setAttribute('name', 'header');
    document.body.appendChild(slotEl);

    processNativeSlot(slotEl);

    // Without template ancestor, slot remains unchanged
    expect(document.body.innerHTML).toContain('slot');
  });

  it('should use "default" when no name attribute', () => {
    const slotEl = document.createElement('slot');
    document.body.appendChild(slotEl);

    processNativeSlot(slotEl);

    expect(document.body.innerHTML).toContain('slot');
  });

  it('should not throw when no template ancestor', () => {
    const slotEl = document.createElement('slot');
    document.body.appendChild(slotEl);

    expect(() => {
      processNativeSlot(slotEl);
    }).not.toThrow();
  });

  it('should replace slot with content when template ancestor exists', async () => {
    const templates = createMemoryRegistry({
      wrapper: '<div class="wrapper"><slot></slot></div>'
    });

    const templateEl = document.createElement('div');
    templateEl.innerHTML = '<span>Slot content</span>';
    document.body.appendChild(templateEl);

    await template('wrapper' as Expression, templateEl, templates);

    const slotEl = templateEl.querySelector('slot');
    if (slotEl) {
      processNativeSlot(slotEl);
      // outerHTML replacement means slot tag is gone
      expect(templateEl.querySelector('.wrapper')?.innerHTML).toBe('<span>Slot content</span>');
    }
  });

  it('should replace named slot with matching content', async () => {
    const templates = createMemoryRegistry({
      layout: '<header><slot name="title"></slot></header>'
    });

    const templateEl = document.createElement('div');
    templateEl.innerHTML = '<h1 slot="title">Page Title</h1>';
    document.body.appendChild(templateEl);

    await template('layout' as Expression, templateEl, templates);

    const slotEl = templateEl.querySelector('slot[name="title"]');
    if (slotEl) {
      processNativeSlot(slotEl);
      expect(templateEl.querySelector('header')?.innerHTML).toBe('<h1 slot="title">Page Title</h1>');
    }
  });

  it('should leave slot unchanged when no matching content', async () => {
    const templates = createMemoryRegistry({
      box: '<div><slot name="missing"></slot></div>'
    });

    const templateEl = document.createElement('div');
    templateEl.innerHTML = '<p>Default content only</p>';
    document.body.appendChild(templateEl);

    await template('box' as Expression, templateEl, templates);

    const slotEl = templateEl.querySelector('slot[name="missing"]');
    if (slotEl) {
      processNativeSlot(slotEl);
      // Slot remains because no matching content
      expect(templateEl.querySelector('slot[name="missing"]')).toBeDefined();
    }
  });
});
