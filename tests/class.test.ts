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

  it('should remove a toggled class when its condition flips to false', () => {
    const state = reactive({ isOpen: true });
    const ctx = createContext(mode, state);
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    cclass('{ open: isOpen }' as Expression, el, $eval);
    expect(el.classList.contains('open')).toBe(true);

    state.isOpen = false;
    expect(el.classList.contains('open')).toBe(false);

    state.isOpen = true;
    expect(el.classList.contains('open')).toBe(true);
  });

  it('should treat array entries the same as top-level values', () => {
    const state = reactive({ isOpen: false });
    const ctx = createContext(mode, state);
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    cclass("['root', { open: isOpen }]" as Expression, el, $eval);

    expect(el.classList.contains('root')).toBe(true);
    expect(el.classList.contains('open')).toBe(false);

    state.isOpen = true;
    expect(el.classList.contains('root')).toBe(true);
    expect(el.classList.contains('open')).toBe(true);

    state.isOpen = false;
    expect(el.classList.contains('root')).toBe(true);
    expect(el.classList.contains('open')).toBe(false);
  });

  it('should toggle multiple conditional classes nested in an array', () => {
    const state = reactive({ a: true, b: false });
    const ctx = createContext(mode, state);
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    cclass("['static', { classA: a, classB: b }]" as Expression, el, $eval);

    expect(el.classList.contains('static')).toBe(true);
    expect(el.classList.contains('classA')).toBe(true);
    expect(el.classList.contains('classB')).toBe(false);

    state.a = false;
    state.b = true;
    expect(el.classList.contains('static')).toBe(true);
    expect(el.classList.contains('classA')).toBe(false);
    expect(el.classList.contains('classB')).toBe(true);
  });

  it('should not touch classes it was never told about', () => {
    const state = reactive({ isOpen: true });
    const ctx = createContext(mode, state);
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');
    el.classList.add('managed-elsewhere');

    cclass('{ open: isOpen }' as Expression, el, $eval);
    expect(el.classList.contains('managed-elsewhere')).toBe(true);

    state.isOpen = false;
    expect(el.classList.contains('managed-elsewhere')).toBe(true);
    expect(el.classList.contains('open')).toBe(false);
  });
});
