import { describe, it, expect, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom/worker';
import { text } from '../src/directives/text.js';
import { html } from '../src/directives/html.js';
import { show } from '../src/directives/show.js';
import { createContext } from '../src/context.js';
import { Mode, Expression, EvalFn, directive, getDirective, clearDirectives, configureDirective } from '../src/types.js';
import { createContextKey, registerContext } from '../src/context-registry.js';

describe('text directive', () => {
  let document: Document;
  let $eval: EvalFn;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
  });

  it('should set element textContent', () => {
    const ctx = createContext(Mode.SERVER, { name: 'Alice' });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('span');

    text('name' as Expression, el, $eval);

    expect(el.textContent).toBe('Alice');
  });

  it('should handle complex expressions', () => {
    const ctx = createContext(Mode.SERVER, { first: 'John', last: 'Doe' });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('span');

    text('first + " " + last' as Expression, el, $eval);

    expect(el.textContent).toBe('John Doe');
  });

  it('should handle null values', () => {
    const ctx = createContext(Mode.SERVER, { value: null });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('span');

    text('value' as Expression, el, $eval);

    expect(el.textContent).toBe('');
  });

  it('should handle undefined values', () => {
    const ctx = createContext(Mode.SERVER, {});
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('span');

    text('missing' as Expression, el, $eval);

    expect(el.textContent).toBe('');
  });

  it('should convert numbers to strings', () => {
    const ctx = createContext(Mode.SERVER, { count: 42 });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('span');

    text('count' as Expression, el, $eval);

    expect(el.textContent).toBe('42');
  });

  it('should escape HTML in values', () => {
    const ctx = createContext(Mode.SERVER, { value: '<script>alert("xss")</script>' });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('span');

    text('value' as Expression, el, $eval);

    // textContent doesn't interpret HTML
    expect(el.textContent).toBe('<script>alert("xss")</script>');
    expect(el.innerHTML).not.toContain('<script>');
  });
});

describe('html directive', () => {
  let document: Document;
  let $eval: EvalFn;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
  });

  it('should set element innerHTML', () => {
    const ctx = createContext(Mode.SERVER, { content: '<strong>Bold</strong>' });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    html('content' as Expression, el, $eval);

    expect(el.innerHTML).toBe('<strong>Bold</strong>');
  });

  it('should handle null values', () => {
    const ctx = createContext(Mode.SERVER, { content: null });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    html('content' as Expression, el, $eval);

    expect(el.innerHTML).toBe('');
  });

  it('should handle undefined values', () => {
    const ctx = createContext(Mode.SERVER, {});
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    html('missing' as Expression, el, $eval);

    expect(el.innerHTML).toBe('');
  });

  it('should render nested HTML structures', () => {
    const ctx = createContext(Mode.SERVER, {
      content: '<ul><li>One</li><li>Two</li></ul>'
    });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div');

    html('content' as Expression, el, $eval);

    expect(el.querySelectorAll('li').length).toBe(2);
  });
});

describe('show directive', () => {
  let document: Document;
  let $eval: EvalFn;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
  });

  it('should show element when value is truthy', () => {
    const ctx = createContext(Mode.SERVER, { visible: true });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div') as unknown as HTMLElement;

    show('visible' as Expression, el, $eval);

    expect(el.style.display).toBe('');
  });

  it('should hide element when value is falsy', () => {
    const ctx = createContext(Mode.SERVER, { visible: false });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div') as unknown as HTMLElement;

    show('visible' as Expression, el, $eval);

    expect(el.style.display).toBe('none');
  });

  it('should treat null as falsy', () => {
    const ctx = createContext(Mode.SERVER, { value: null });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div') as unknown as HTMLElement;

    show('value' as Expression, el, $eval);

    expect(el.style.display).toBe('none');
  });

  it('should treat empty string as falsy', () => {
    const ctx = createContext(Mode.SERVER, { value: '' });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div') as unknown as HTMLElement;

    show('value' as Expression, el, $eval);

    expect(el.style.display).toBe('none');
  });

  it('should treat zero as falsy', () => {
    const ctx = createContext(Mode.SERVER, { value: 0 });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div') as unknown as HTMLElement;

    show('value' as Expression, el, $eval);

    expect(el.style.display).toBe('none');
  });

  it('should treat non-empty array as truthy', () => {
    const ctx = createContext(Mode.SERVER, { items: [1, 2, 3] });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div') as unknown as HTMLElement;

    show('items.length > 0' as Expression, el, $eval);

    expect(el.style.display).toBe('');
  });

  it('should handle expression evaluation', () => {
    const ctx = createContext(Mode.SERVER, { count: 5, threshold: 3 });
    $eval = ctx.eval.bind(ctx);
    const el = document.createElement('div') as unknown as HTMLElement;

    show('count > threshold' as Expression, el, $eval);

    expect(el.style.display).toBe('');
  });
});

describe('configureDirective', () => {
  beforeEach(() => {
    clearDirectives();
  });

  it('should merge options with existing directive', () => {
    const fn = () => {};
    directive('test-directive', fn, { scope: false });

    configureDirective('test-directive', { scope: true });

    const reg = getDirective('test-directive');
    expect(reg?.options.scope).toBe(true);
    expect(reg?.fn).toBe(fn);
  });

  it('should preserve existing options when adding new ones', () => {
    const fn = () => {};
    directive('test-directive', fn, { scope: true });

    configureDirective('test-directive', { template: '<div></div>' });

    const reg = getDirective('test-directive');
    expect(reg?.options.scope).toBe(true);
    expect(reg?.options.template).toBe('<div></div>');
  });

  it('should store options for not-yet-registered directive', () => {
    configureDirective('future-directive', { scope: true });

    const reg = getDirective('future-directive');
    expect(reg?.options.scope).toBe(true);
    expect(reg?.fn).toBeNull();
  });

  it('should preserve function when configuring', () => {
    const fn = () => {};
    directive('my-directive', fn);

    configureDirective('my-directive', { scope: true, template: '<span></span>' });

    const reg = getDirective('my-directive');
    expect(reg?.fn).toBe(fn);
    expect(reg?.options.scope).toBe(true);
    expect(reg?.options.template).toBe('<span></span>');
  });

  it('should override individual options', () => {
    const fn = () => {};
    directive('test-directive', fn, { scope: true, template: '<old></old>' });

    configureDirective('test-directive', { template: '<new></new>' });

    const reg = getDirective('test-directive');
    expect(reg?.options.scope).toBe(true);
    expect(reg?.options.template).toBe('<new></new>');
  });

  it('should support using option for context dependencies', () => {
    const ThemeContext = createContextKey<{ mode: string }>('Theme');
    const UserContext = createContextKey<{ name: string }>('User');

    const fn = () => {};
    directive('context-consumer', fn, {
      using: [ThemeContext, UserContext]
    });

    const reg = getDirective('context-consumer');
    expect(reg?.options.using).toEqual([ThemeContext, UserContext]);
    expect(reg?.options.using?.length).toBe(2);
  });

  it('should allow configuring using option after registration', () => {
    const ThemeContext = createContextKey<{ mode: string }>('Theme');

    const fn = () => {};
    directive('late-context', fn);

    configureDirective('late-context', { using: [ThemeContext] });

    const reg = getDirective('late-context');
    expect(reg?.options.using).toEqual([ThemeContext]);
  });
});

describe('assign option', () => {
  beforeEach(() => {
    clearDirectives();
  });

  it('should throw error when assign is used without scope: true', () => {
    const fn = () => {};

    expect(() => {
      directive('no-scope-assign', fn, {
        assign: { $styles: { container: 'abc123' } }
      });
    }).toThrow("Directive 'no-scope-assign': 'assign' requires 'scope: true'");
  });

  it('should allow assign with scope: true', () => {
    const fn = () => {};
    const styles = { container: 'abc123', button: 'def456' };

    directive('scoped-assign', fn, {
      scope: true,
      assign: { $styles: styles }
    });

    const reg = getDirective('scoped-assign');
    expect(reg?.options.scope).toBe(true);
    expect(reg?.options.assign).toEqual({ $styles: styles });
  });

  it('should store multiple assigned values', () => {
    const fn = () => {};
    const styles = { container: 'abc' };
    const config = { theme: 'dark' };

    directive('multi-assign', fn, {
      scope: true,
      assign: { $styles: styles, $config: config }
    });

    const reg = getDirective('multi-assign');
    expect(reg?.options.assign?.$styles).toBe(styles);
    expect(reg?.options.assign?.$config).toBe(config);
  });
});
