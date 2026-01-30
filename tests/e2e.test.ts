/**
 * End-to-end tests for SSR → hydration flow.
 *
 * These tests simulate the full lifecycle:
 * 1. Server renders HTML with directives
 * 2. Browser parses the HTML
 * 3. Client hydrates the DOM
 * 4. Reactive updates work correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, registerDirective as registerServerDirective } from '../src/server/render.js';
import { init, resetHydration } from '../src/client/hydrate.js';
import { directive, clearDirectives, Directive } from '../src/types.js';
import { clearRootScope, clearElementScopes } from '../src/scope.js';
import { text } from '../src/directives/text.js';
import { show } from '../src/directives/show.js';
import { cclass } from '../src/directives/class.js';
import { cfor } from '../src/directives/for.js';
import { cif } from '../src/directives/if.js';
import { applyGlobals, cleanupGlobals } from './test-globals.js';

describe('E2E: SSR → Hydration', () => {
  let serverRegistry: Map<string, Directive>;

  beforeEach(() => {
    applyGlobals();
    clearDirectives();

    serverRegistry = new Map();
    registerServerDirective(serverRegistry, 'text', text);
    registerServerDirective(serverRegistry, 'show', show);
    registerServerDirective(serverRegistry, 'class', cclass);
    registerServerDirective(serverRegistry, 'for', cfor);
    registerServerDirective(serverRegistry, 'if', cif);

    directive('g-text', text);
    directive('g-show', show);
    directive('g-class', cclass);
    directive('g-for', cfor);
    directive('g-if', cif);
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    resetHydration();
    cleanupGlobals();
  });

  /**
   * Helper to create a scoped state provider directive for testing.
   * This mimics how real apps (like todo-app) provide state to child elements.
   */
  function createStateProvider(initialState: Record<string, unknown>) {
    const stateProvider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
      Object.assign($scope, initialState);
    };
    stateProvider.$inject = ['$element', '$scope'];
    return stateProvider;
  }

  it('should render g-text on server with correct content', async () => {
    const ssrHtml = await render(
      '<span g-text="message"></span>',
      { message: 'Hello from server' },
      serverRegistry
    );

    expect(ssrHtml).toContain('>Hello from server</span>');
  });

  it('should render g-show visible on server', async () => {
    const ssrHtml = await render(
      '<p g-show="visible">Content</p>',
      { visible: true },
      serverRegistry
    );

    expect(ssrHtml).not.toContain('style="display: none;"');
  });

  it('should render g-show hidden on server', async () => {
    const ssrHtml = await render(
      '<p g-show="visible">Content</p>',
      { visible: false },
      serverRegistry
    );

    expect(ssrHtml).toContain('style="display: none;"');
  });

  it('should render g-class on server', async () => {
    const ssrHtml = await render(
      '<button g-class="{ active: isActive, error: hasError }">Click</button>',
      { isActive: true, hasError: false },
      serverRegistry
    );

    expect(ssrHtml).toContain('class="active"');
    // The error class should not be applied (class="active" not class="active error")
    expect(ssrHtml).not.toContain('class="active error"');
  });

  it('should render g-for on server with template wrapper', async () => {
    const ssrHtml = await render(
      '<ul><li g-for="item in items" g-text="item"></li></ul>',
      { items: ['Apple', 'Banana', 'Cherry'] },
      serverRegistry
    );

    // Should have template element
    expect(ssrHtml).toContain('<template g-for="item in items">');

    // Should have rendered items
    expect(ssrHtml).toContain('>Apple</li>');
    expect(ssrHtml).toContain('>Banana</li>');
    expect(ssrHtml).toContain('>Cherry</li>');

    // Items should be marked as processed
    expect(ssrHtml).toContain('data-g-for-processed');
  });

  it('should render g-for with index on server', async () => {
    const ssrHtml = await render(
      '<span g-for="(item, idx) in items" g-text="idx + \': \' + item"></span>',
      { items: ['a', 'b', 'c'] },
      serverRegistry
    );

    expect(ssrHtml).toContain('>0: a</span>');
    expect(ssrHtml).toContain('>1: b</span>');
    expect(ssrHtml).toContain('>2: c</span>');
  });

  it('should render g-for with objects on server', async () => {
    const ssrHtml = await render(
      '<div g-for="(value, key) in obj" g-text="key + \'=\' + value"></div>',
      { obj: { name: 'Alice', age: '30' } },
      serverRegistry
    );

    expect(ssrHtml).toContain('>name=Alice</div>');
    expect(ssrHtml).toContain('>age=30</div>');
  });

  it('should render g-if true on server', async () => {
    const ssrHtml = await render(
      '<p g-if="show">Visible</p>',
      { show: true },
      serverRegistry
    );

    expect(ssrHtml).toContain('Visible');
  });

  it('should not render g-if false on server', async () => {
    const ssrHtml = await render(
      '<p g-if="show">Hidden</p>',
      { show: false },
      serverRegistry
    );

    // Element is stored in template placeholder for hydration, not rendered visibly
    expect(ssrHtml).toContain('<template data-g-if="show">');
    expect(ssrHtml).not.toContain('<p g-if="show">Hidden</p></template><p'); // Not rendered outside template
  });

  it('should render nested g-for with g-text on server', async () => {
    const ssrHtml = await render(
      '<div g-for="user in users"><span g-text="user.name"></span></div>',
      {
        users: [
          { name: 'Alice' },
          { name: 'Bob' }
        ]
      },
      serverRegistry
    );

    expect(ssrHtml).toContain('>Alice</span>');
    expect(ssrHtml).toContain('>Bob</span>');
  });

  it('should handle empty g-for array on server', async () => {
    const ssrHtml = await render(
      '<ul><li g-for="item in items" g-text="item"></li></ul>',
      { items: [] },
      serverRegistry
    );

    // Should have template but no rendered items
    expect(ssrHtml).toContain('<template g-for="item in items">');
    expect(ssrHtml).not.toContain('data-g-for-processed');
  });

  it('should handle multiple directives on same element on server', async () => {
    const ssrHtml = await render(
      '<span g-text="text" g-class="{ highlight: isHighlighted }" g-show="isVisible">fallback</span>',
      { text: 'Hello', isHighlighted: true, isVisible: true },
      serverRegistry
    );

    expect(ssrHtml).toContain('>Hello</span>');
    expect(ssrHtml).toContain('class="highlight"');
    expect(ssrHtml).not.toContain('style="display: none;"');
  });
});

describe('E2E: Hydration preserves SSR content', () => {
  let serverRegistry: Map<string, Directive>;

  beforeEach(() => {
    applyGlobals();
    clearDirectives();

    serverRegistry = new Map();
    registerServerDirective(serverRegistry, 'text', text);
    registerServerDirective(serverRegistry, 'show', show);
    registerServerDirective(serverRegistry, 'class', cclass);
    registerServerDirective(serverRegistry, 'for', cfor);
    registerServerDirective(serverRegistry, 'if', cif);

    directive('g-text', text);
    directive('g-show', show);
    directive('g-class', cclass);
    directive('g-for', cfor);
    directive('g-if', cif);
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    resetHydration();
    cleanupGlobals();
  });

  it('should not duplicate g-text content during hydration', async () => {
    // Server renders HTML
    const ssrHtml = await render(
      '<span g-text="message"></span>',
      { message: 'Hello World' },
      serverRegistry
    );

    expect(ssrHtml).toContain('>Hello World</span>');

    // Simulate browser parsing SSR output
    document.body.innerHTML = ssrHtml;

    // Create provider with same state as server
    const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
      $scope.message = 'Hello World';
    };
    provider.$inject = ['$element', '$scope'];
    directive('app', provider, { scope: true });

    // Wrap in app element for scoped state
    document.body.innerHTML = `<app>${ssrHtml}</app>`;

    // Hydrate
    await init();
    await new Promise(r => setTimeout(r, 10));

    // Content should still be "Hello World", not duplicated or empty
    const span = document.querySelector('span')!;
    expect(span.textContent).toBe('Hello World');

    // Should only have one span (no duplication)
    expect(document.querySelectorAll('span').length).toBe(1);
  });

  it('should not duplicate g-for items during hydration', async () => {
    // Server renders g-for
    const ssrHtml = await render(
      '<ul><li g-for="item in items" g-text="item"></li></ul>',
      { items: ['Apple', 'Banana'] },
      serverRegistry
    );

    // Should have template + 2 rendered items
    expect(ssrHtml).toContain('<template g-for="item in items">');
    expect(ssrHtml).toContain('>Apple</li>');
    expect(ssrHtml).toContain('>Banana</li>');

    // Create provider with same state
    const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
      $scope.items = ['Apple', 'Banana'];
    };
    provider.$inject = ['$element', '$scope'];
    directive('app', provider, { scope: true });

    // Simulate browser with SSR content
    document.body.innerHTML = `<app>${ssrHtml}</app>`;

    // Count items before hydration
    const beforeCount = document.querySelectorAll('li').length;

    // Hydrate
    await init();
    await new Promise(r => setTimeout(r, 10));

    // After hydration, should have same number of items (2 rendered + 1 in template)
    const afterItems = document.querySelectorAll('li:not([data-g-for-template])');

    // Should still have exactly 2 items, not 4 (which would indicate duplication)
    expect(afterItems.length).toBe(2);
    expect(afterItems[0].textContent).toBe('Apple');
    expect(afterItems[1].textContent).toBe('Banana');
  });

  it('should preserve g-show display state from SSR', async () => {
    // Server renders with visible=false
    const ssrHtml = await render(
      '<p g-show="visible">Hidden content</p>',
      { visible: false },
      serverRegistry
    );

    expect(ssrHtml).toContain('style="display: none;"');

    const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
      $scope.visible = false;
    };
    provider.$inject = ['$element', '$scope'];
    directive('app', provider, { scope: true });

    document.body.innerHTML = `<app>${ssrHtml}</app>`;

    await init();
    await new Promise(r => setTimeout(r, 10));

    const p = document.querySelector('p') as HTMLElement;
    // Should still be hidden, not flashed visible then hidden
    expect(p.style.display).toBe('none');
  });

  it('should preserve g-class classes from SSR', async () => {
    const ssrHtml = await render(
      '<button g-class="{ active: isActive }">Click</button>',
      { isActive: true },
      serverRegistry
    );

    expect(ssrHtml).toContain('class="active"');

    const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
      $scope.isActive = true;
    };
    provider.$inject = ['$element', '$scope'];
    directive('app', provider, { scope: true });

    document.body.innerHTML = `<app>${ssrHtml}</app>`;

    await init();
    await new Promise(r => setTimeout(r, 10));

    const button = document.querySelector('button')!;
    // Should still have 'active' class
    expect(button.classList.contains('active')).toBe(true);
  });
});

describe('E2E: Client hydration initialization', () => {
  beforeEach(() => {
    applyGlobals();
    clearDirectives();
    directive('g-text', text);
    directive('g-show', show);
    directive('g-class', cclass);
    directive('g-for', cfor);
    directive('g-if', cif);
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    resetHydration();
    cleanupGlobals();
  });

  it('should hydrate g-text with scoped state', async () => {
    // Create a state provider directive that sets up state
    const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
      $scope.message = 'Hello World';
    };
    provider.$inject = ['$element', '$scope'];
    directive('test-provider', provider, { scope: true });

    document.body.innerHTML = '<test-provider><span g-text="message"></span></test-provider>';

    await init();
    await new Promise(r => setTimeout(r, 10));

    const span = document.querySelector('span')!;
    expect(span.textContent).toBe('Hello World');
  });

  it('should hydrate g-show based on state', async () => {
    const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
      $scope.visible = false;
    };
    provider.$inject = ['$element', '$scope'];
    directive('test-provider', provider, { scope: true });

    document.body.innerHTML = '<test-provider><p g-show="visible">Content</p></test-provider>';

    await init();
    await new Promise(r => setTimeout(r, 10));

    const p = document.querySelector('p') as HTMLElement;
    expect(p.style.display).toBe('none');
  });

  it('should hydrate g-class based on state', async () => {
    const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
      $scope.isActive = true;
    };
    provider.$inject = ['$element', '$scope'];
    directive('test-provider', provider, { scope: true });

    document.body.innerHTML = '<test-provider><button g-class="{ active: isActive }">Click</button></test-provider>';

    await init();
    await new Promise(r => setTimeout(r, 10));

    const button = document.querySelector('button')!;
    expect(button.classList.contains('active')).toBe(true);
  });

  it('should hydrate g-for and render items', async () => {
    const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
      $scope.items = ['Apple', 'Banana'];
    };
    provider.$inject = ['$element', '$scope'];
    directive('test-provider', provider, { scope: true });

    document.body.innerHTML = '<test-provider><ul><li g-for="item in items" g-text="item"></li></ul></test-provider>';

    await init();
    await new Promise(r => setTimeout(r, 10));

    const items = document.querySelectorAll('li:not([data-g-for-template])');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('Apple');
    expect(items[1].textContent).toBe('Banana');
  });
});

describe('E2E: assign option', () => {
  beforeEach(() => {
    applyGlobals();
    clearDirectives();
    directive('g-text', text);
    directive('g-class', cclass);
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    resetHydration();
    cleanupGlobals();
  });

  it('should make assigned values available in expressions', async () => {
    const styles = { container: 'style-abc123', title: 'style-def456' };

    // Directive with assign option
    const handler: Directive = () => {};
    directive('styled-component', handler, {
      scope: true,
      assign: { $styles: styles }
    });

    document.body.innerHTML = '<styled-component><div g-class="{ [$styles.container]: true }"></div></styled-component>';

    await init();
    await new Promise(r => setTimeout(r, 10));

    const div = document.querySelector('div')!;
    expect(div.classList.contains('style-abc123')).toBe(true);
  });

  it('should make assigned values available in g-text expressions', async () => {
    const config = { greeting: 'Hello from assign!' };

    const handler: Directive = () => {};
    directive('config-component', handler, {
      scope: true,
      assign: { $config: config }
    });

    document.body.innerHTML = '<config-component><span g-text="$config.greeting"></span></config-component>';

    await init();
    await new Promise(r => setTimeout(r, 10));

    const span = document.querySelector('span')!;
    expect(span.textContent).toBe('Hello from assign!');
  });

  it('should allow multiple assigned values', async () => {
    const styles = { box: 'box-class' };
    const theme = { mode: 'dark' };

    const handler: Directive = () => {};
    directive('multi-assign-component', handler, {
      scope: true,
      assign: { $styles: styles, $theme: theme }
    });

    document.body.innerHTML = '<multi-assign-component><span g-text="$theme.mode"></span></multi-assign-component>';

    await init();
    await new Promise(r => setTimeout(r, 10));

    const span = document.querySelector('span')!;
    expect(span.textContent).toBe('dark');
  });
});
