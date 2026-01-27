import { describe, it, expect, beforeEach } from 'vitest';
import { render, registerDirective, registerService } from '../src/server/render.js';
import { text } from '../src/directives/text.js';
import { html } from '../src/directives/html.js';
import { show } from '../src/directives/show.js';
import { template } from '../src/directives/template.js';
import { slot } from '../src/directives/slot.js';
import { createMemoryRegistry } from '../src/templates.js';
import { Directive, DirectivePriority, Expression } from '../src/types.js';

describe('server render', () => {
  it('should render basic text directive', async () => {
    const registry = new Map<string, Directive>();
    registry.set('text', text);

    const result = await render(
      '<span g-text="name"></span>',
      { name: 'Alice' },
      registry
    );

    expect(result).toBe('<span g-text="name">Alice</span>');
  });

  it('should render multiple directives', async () => {
    const registry = new Map<string, Directive>();
    registry.set('text', text);

    const result = await render(
      '<span g-text="first"></span> <span g-text="last"></span>',
      { first: 'John', last: 'Doe' },
      registry
    );

    expect(result).toBe('<span g-text="first">John</span> <span g-text="last">Doe</span>');
  });

  it('should render show directive', async () => {
    const registry = new Map<string, Directive>();
    registry.set('show', show);

    const result = await render(
      '<div g-show="visible">Visible</div><div g-show="hidden">Hidden</div>',
      { visible: true, hidden: false },
      registry
    );

    expect(result).toContain('>Visible</div>');
    expect(result).toContain('style="display: none;"');
  });

  it('should render html directive', async () => {
    const registry = new Map<string, Directive>();
    registry.set('html', html);

    const result = await render(
      '<div g-html="content"></div>',
      { content: '<strong>Bold</strong>' },
      registry
    );

    expect(result).toBe('<div g-html="content"><strong>Bold</strong></div>');
  });

  it('should preserve directive attributes for hydration', async () => {
    const registry = new Map<string, Directive>();
    registry.set('text', text);

    const result = await render(
      '<span g-text="name"></span>',
      { name: 'Alice' },
      registry
    );

    expect(result).toContain('g-text="name"');
  });

  it('should handle nested elements', async () => {
    const registry = new Map<string, Directive>();
    registry.set('text', text);

    const result = await render(
      '<div><span g-text="name"></span></div>',
      { name: 'Bob' },
      registry
    );

    expect(result).toBe('<div><span g-text="name">Bob</span></div>');
  });

  it('should handle multiple directives on same element', async () => {
    const registry = new Map<string, Directive>();
    registry.set('text', text);
    registry.set('show', show);

    const result = await render(
      '<span g-text="name" g-show="visible"></span>',
      { name: 'Alice', visible: true },
      registry
    );

    expect(result).toContain('Alice');
    expect(result).not.toContain('style="display: none;"');
  });

  it('should respect directive priority', async () => {
    const registry = new Map<string, Directive>();
    const order: string[] = [];

    const lowPriority: Directive = () => { order.push('low'); };
    lowPriority.priority = DirectivePriority.NORMAL;

    const highPriority: Directive = () => { order.push('high'); };
    highPriority.priority = DirectivePriority.STRUCTURAL;

    registry.set('low', lowPriority);
    registry.set('high', highPriority);

    await render(
      '<div g-low="" g-high=""></div>',
      {},
      registry
    );

    expect(order[0]).toBe('high');
    expect(order[1]).toBe('low');
  });
});

describe('server render with templates', () => {
  it('should render templates with slots', async () => {
    const templates = createMemoryRegistry({
      card: '<div class="card"><slot></slot></div>'
    });

    registerService('$templates', templates);

    const registry = new Map<string, Directive>();
    registry.set('template', template);
    registry.set('slot', slot);

    const result = await render(
      '<div g-template="card"><p>Content</p></div>',
      {},
      registry
    );

    expect(result).toContain('<div class="card">');
    expect(result).toContain('<p>Content</p>');
  });

  it('should render named slots', async () => {
    const templates = createMemoryRegistry({
      card: '<div class="card"><header><slot name="title"></slot></header><main><slot></slot></main></div>'
    });

    registerService('$templates', templates);

    const registry = new Map<string, Directive>();
    registry.set('template', template);
    registry.set('slot', slot);

    const result = await render(
      '<div g-template="card"><h1 slot="title">Title</h1><p>Body</p></div>',
      {},
      registry
    );

    expect(result).toContain('<header><h1 slot="title">Title</h1></header>');
    expect(result).toContain('<main><p>Body</p></main>');
  });

  it('should process directives inside templates', async () => {
    const templates = createMemoryRegistry({
      greeting: '<p>Hello, <span g-text="name"></span>!</p>'
    });

    registerService('$templates', templates);

    const registry = new Map<string, Directive>();
    registry.set('template', template);
    registry.set('text', text);

    const result = await render(
      '<div g-template="greeting"></div>',
      { name: 'World' },
      registry
    );

    expect(result).toContain('Hello, <span g-text="name">World</span>!');
  });

  it('should process directives in slot content', async () => {
    const templates = createMemoryRegistry({
      wrapper: '<div class="wrapper"><slot></slot></div>'
    });

    registerService('$templates', templates);

    const registry = new Map<string, Directive>();
    registry.set('template', template);
    registry.set('slot', slot);
    registry.set('text', text);

    const result = await render(
      '<div g-template="wrapper"><span g-text="message"></span></div>',
      { message: 'Hello!' },
      registry
    );

    expect(result).toContain('<span g-text="message">Hello!</span>');
  });
});

describe('registerDirective', () => {
  it('should add directive to registry', () => {
    const registry = new Map<string, Directive>();
    registerDirective(registry, 'test', text);

    expect(registry.has('test')).toBe(true);
  });
});

describe('render caching', () => {
  it('should cache selector and reuse on second render', async () => {
    const registry = new Map<string, Directive>();
    registry.set('text', text);

    // First render - builds selector
    const result1 = await render(
      '<span g-text="a"></span>',
      { a: 'first' },
      registry
    );

    // Second render with same registry - uses cached selector
    const result2 = await render(
      '<span g-text="b"></span>',
      { b: 'second' },
      registry
    );

    expect(result1).toContain('first');
    expect(result2).toContain('second');
  });
});

describe('render edge cases', () => {
  it('should handle nested elements where parent does not match selector', async () => {
    const registry = new Map<string, Directive>();
    registry.set('text', text);

    // The outer div doesn't match [g-text], only the inner span does
    const result = await render(
      '<div><span g-text="name"></span></div>',
      { name: 'test' },
      registry
    );

    expect(result).toContain('test');
  });

  it('should handle elements with no directives', async () => {
    const registry = new Map<string, Directive>();
    registry.set('text', text);

    const result = await render(
      '<div><p>No directives here</p></div>',
      {},
      registry
    );

    expect(result).toBe('<div><p>No directives here</p></div>');
  });
});

describe('dependency injection', () => {
  it('should inject $scope as local element state', async () => {
    const registry = new Map<string, Directive>();

    const stateDirective: Directive = (
      $element: Element,
      $scope: Record<string, unknown>
    ) => {
      // $scope is local to this element, starts empty
      $scope.count = 42;
      ($element as HTMLElement).textContent = JSON.stringify($scope);
    };
    stateDirective.$inject = ['$element', '$scope'];

    registry.set('state', stateDirective);

    const result = await render(
      '<div g-state=""></div>',
      {},
      registry
    );

    expect(result).toContain('{"count":42}');
  });

  it('should share $scope between directives on same element', async () => {
    const registry = new Map<string, Directive>();

    // First directive sets a value
    const setterDirective: Directive = ($scope: Record<string, unknown>) => {
      $scope.value = 'shared';
    };
    setterDirective.$inject = ['$scope'];
    setterDirective.priority = 100; // Run first

    // Second directive reads it
    const readerDirective: Directive = (
      $element: Element,
      $scope: Record<string, unknown>
    ) => {
      ($element as HTMLElement).textContent = $scope.value as string;
    };
    readerDirective.$inject = ['$element', '$scope'];

    registry.set('setter', setterDirective);
    registry.set('reader', readerDirective);

    const result = await render(
      '<div g-setter="" g-reader=""></div>',
      {},
      registry
    );

    expect(result).toContain('shared');
  });

  it('should inject custom services', async () => {
    const myService = { getValue: () => 'service-value' };
    registerService('myService', myService);

    const registry = new Map<string, Directive>();

    const serviceDirective: Directive = (
      $element: Element,
      svc: { getValue: () => string }
    ) => {
      ($element as HTMLElement).textContent = svc.getValue();
    };
    serviceDirective.$inject = ['$element', 'myService'];

    registry.set('svc', serviceDirective);

    const result = await render(
      '<div g-svc=""></div>',
      {},
      registry
    );

    expect(result).toContain('service-value');
  });

  it('should throw on unknown injectable', async () => {
    const registry = new Map<string, Directive>();

    const badDirective: Directive = () => {};
    badDirective.$inject = ['$element', 'unknownService'];

    registry.set('bad', badDirective);

    await expect(
      render('<div g-bad=""></div>', {}, registry)
    ).rejects.toThrow('Unknown injectable: unknownService');
  });

  it('should resolve provided context from ancestor', async () => {
    const registry = new Map<string, Directive>();

    // Provider sets up state and declares $context
    const themeProvider: Directive = ($scope: Record<string, unknown>) => {
      $scope.mode = 'dark';
      $scope.primary = '#007bff';
    };
    themeProvider.$inject = ['$scope'];
    themeProvider.$context = ['theme'];

    // Consumer injects 'theme' from ancestor
    const themedButton: Directive = (
      $element: Element,
      theme: Record<string, unknown>
    ) => {
      ($element as HTMLElement).textContent = theme?.mode as string ?? 'NO_THEME';
    };
    themedButton.$inject = ['$element', 'theme'];

    // Use lowercase directive names (HTML convention, and linkedom CSS selector limitation)
    registry.set('themeprovider', themeProvider);
    registry.set('themedbutton', themedButton);

    const result = await render(
      '<div g-themeprovider=""><span g-themedbutton=""></span></div>',
      {},
      registry
    );

    expect(result).toContain('dark');
  });

  it('should resolve from nearest ancestor provider', async () => {
    const registry = new Map<string, Directive>();

    // Provider stores expression in state and declares $context
    const provider: Directive = ($scope: Record<string, unknown>, $expr: Expression) => {
      $scope.value = $expr;
    };
    provider.$inject = ['$scope', '$expr'];
    provider.$context = ['config'];

    // Consumer injects 'config' from nearest ancestor provider
    const consumer: Directive = (
      $element: Element,
      config: Record<string, unknown>
    ) => {
      ($element as HTMLElement).textContent = config.value as string;
    };
    consumer.$inject = ['$element', 'config'];

    registry.set('provider', provider);
    registry.set('consumer', consumer);

    // Nested providers - consumer should get value from nearest (inner) provider
    // Tree order ensures parents are processed before children
    const result = await render(
      '<div g-provider="outer"><div g-provider="inner"><span g-consumer=""></span></div></div>',
      {},
      registry
    );

    expect(result).toContain('inner');
  });
});

describe('g-for SSR', () => {
  it('should wrap original element in template element', async () => {
    const { cfor, FOR_TEMPLATE_ATTR } = await import('../src/directives/for.js');
    const registry = new Map<string, Directive>();
    registry.set('for', cfor);

    const result = await render(
      '<div g-for="item in items"><span>item</span></div>',
      { items: ['a', 'b'] },
      registry
    );

    // Should have a template element with g-for attribute
    expect(result).toContain('<template g-for="item in items">');
    expect(result).toContain('</template>');

    // Template content should have data-g-for-template marker
    expect(result).toContain(FOR_TEMPLATE_ATTR);
  });

  it('should render items after template element', async () => {
    const { cfor } = await import('../src/directives/for.js');
    const registry = new Map<string, Directive>();
    registry.set('for', cfor);
    registry.set('text', text);

    const result = await render(
      '<li g-for="item in items" g-text="item"></li>',
      { items: ['first', 'second', 'third'] },
      registry
    );

    // Should have the template element
    expect(result).toContain('<template g-for="item in items">');

    // Should render items with text content
    expect(result).toContain('>first</li>');
    expect(result).toContain('>second</li>');
    expect(result).toContain('>third</li>');
  });

  it('should mark rendered items with data-g-for-processed', async () => {
    const { cfor, FOR_PROCESSED_ATTR } = await import('../src/directives/for.js');
    const registry = new Map<string, Directive>();
    registry.set('for', cfor);

    const result = await render(
      '<div g-for="item in items">content</div>',
      { items: ['a', 'b'] },
      registry
    );

    // Each rendered item should have the processed attribute
    const processedCount = (result.match(/data-g-for-processed/g) || []).length;
    expect(processedCount).toBe(2);
  });

  it('should handle empty array', async () => {
    const { cfor } = await import('../src/directives/for.js');
    const registry = new Map<string, Directive>();
    registry.set('for', cfor);

    const result = await render(
      '<div g-for="item in items">content</div>',
      { items: [] },
      registry
    );

    // Should still have template element
    expect(result).toContain('<template g-for="item in items">');
    // But no rendered items (no processed attr)
    expect(result).not.toContain('data-g-for-processed');
  });

  it('should handle index in for expression', async () => {
    const { cfor } = await import('../src/directives/for.js');
    const registry = new Map<string, Directive>();
    registry.set('for', cfor);
    registry.set('text', text);

    const result = await render(
      '<li g-for="(item, idx) in items" g-text="idx + \': \' + item"></li>',
      { items: ['a', 'b'] },
      registry
    );

    expect(result).toContain('>0: a</li>');
    expect(result).toContain('>1: b</li>');
  });

  it('should handle object iteration', async () => {
    const { cfor } = await import('../src/directives/for.js');
    const registry = new Map<string, Directive>();
    registry.set('for', cfor);
    registry.set('text', text);

    const result = await render(
      '<li g-for="(value, key) in obj" g-text="key + \': \' + value"></li>',
      { obj: { name: 'Alice', age: '30' } },
      registry
    );

    expect(result).toContain('>name: Alice</li>');
    expect(result).toContain('>age: 30</li>');
  });
});

describe('HTML entity decoding', () => {
  it('should decode numeric entities in directive expressions', async () => {
    const registry = new Map<string, Directive>();
    registry.set('text', text);

    // &#34; is the numeric entity for double quote
    // This simulates what happens when JSON is HTML-encoded
    const result = await render(
      '<span g-text="{&#34;name&#34;: &#34;Alice&#34;}.name"></span>',
      {},
      registry
    );

    expect(result).toContain('>Alice</span>');
  });

  it('should decode numeric entities in g-scope', async () => {
    const registry = new Map<string, Directive>();
    registry.set('text', text);

    const result = await render(
      '<div g-scope="{&#34;title&#34;: &#34;Hello&#34;}"><span g-text="title"></span></div>',
      {},
      registry
    );

    expect(result).toContain('>Hello</span>');
  });
});
