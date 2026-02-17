import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { cclass } from '../src/directives/class.js';
import { createContext } from '../src/context.js';
import { Mode, Expression, EvalFn } from '../src/types.js';
import { reactive } from '../src/reactivity.js';

describe.each([
  ['client', Mode.CLIENT],
  ['server', Mode.SERVER],
] as const)('g-class directive (%s)', (_label, mode) => {
  let document: Document;
  let $eval: EvalFn;

  beforeEach(() => {
    const window = new Window();
    document = window.document as unknown as Document;
  });

  it('should add class when value is truthy', () => {
    const ctx = createContext(mode, { isActive: true });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    cclass('{ active: isActive }' as Expression, el, $eval);

    expect(el.classList.contains('active')).toBe(true);
  });

  it('should remove class when value is falsy', () => {
    const ctx = createContext(mode, { isActive: false });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');
    el.classList.add('active');

    cclass('{ active: isActive }' as Expression, el, $eval);

    expect(el.classList.contains('active')).toBe(false);
  });

  it('should handle multiple classes', () => {
    const ctx = createContext(mode, { isActive: true, hasError: false });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    cclass('{ active: isActive, error: hasError }' as Expression, el, $eval);

    expect(el.classList.contains('active')).toBe(true);
    expect(el.classList.contains('error')).toBe(false);
  });

  it('should preserve static classes', () => {
    const ctx = createContext(mode, { isActive: true });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');
    el.classList.add('base-class');

    cclass('{ active: isActive }' as Expression, el, $eval);

    expect(el.classList.contains('base-class')).toBe(true);
    expect(el.classList.contains('active')).toBe(true);
  });

  it('should handle hyphenated class names', () => {
    const ctx = createContext(mode, { hasError: true });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    cclass("{ 'text-red': hasError }" as Expression, el, $eval);

    expect(el.classList.contains('text-red')).toBe(true);
  });

  it('should handle null value gracefully', () => {
    const ctx = createContext(mode, { classObj: null });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');
    el.classList.add('existing');

    cclass('classObj' as Expression, el, $eval);

    expect(el.classList.contains('existing')).toBe(true);
  });

  it('should handle undefined value gracefully', () => {
    const ctx = createContext(mode, {});
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');
    el.classList.add('existing');

    cclass('missing' as Expression, el, $eval);

    expect(el.classList.contains('existing')).toBe(true);
  });

  it('should react to state changes', () => {
    const state = reactive({ isActive: false });
    const ctx = createContext(mode, state);
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    cclass('{ active: isActive }' as Expression, el, $eval);

    expect(el.classList.contains('active')).toBe(false);

    state.isActive = true;

    expect(el.classList.contains('active')).toBe(true);
  });

  it('should handle expression evaluation', () => {
    const ctx = createContext(mode, { count: 5 });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    cclass('{ "has-items": count > 0 }' as Expression, el, $eval);

    expect(el.classList.contains('has-items')).toBe(true);
  });
});
