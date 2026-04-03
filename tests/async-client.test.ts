import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '../src/server/render.js';
import { hydrate, resetHydration } from '../src/client/hydrate.js';
import { directive, clearDirectives, Directive } from '../src/types.js';
import { clearRootScope, clearElementScopes } from '../src/scope.js';
import { applyGlobals, cleanupGlobals } from './test-globals.js';

describe('async client: hydrate loaded (await mode)', () => {
  beforeEach(() => {
    applyGlobals();
    clearDirectives();
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    resetHydration();
    cleanupGlobals();
  });

  it('should hydrate SSR-loaded async directive without re-rendering template', async () => {
    let fnCallCount = 0;

    const asyncFn: Directive = async ($scope: Record<string, unknown>) => {
      fnCallCount++;
      $scope.ready = true;
    };
    asyncFn.$inject = ['$scope'];

    directive('loaded-widget', asyncFn, {
      scope: true,
      template: '<div class="content">Loaded</div>',
      fallback: '<div>Loading...</div>',
      ssr: 'await',
    });

    // SSR renders the template
    const ssrHtml = await render('<loaded-widget></loaded-widget>', {}, new Map());
    expect(ssrHtml).toContain('data-g-async="loaded"');
    expect(ssrHtml).toContain('Loaded');

    // Client hydrates
    document.body.innerHTML = ssrHtml;
    fnCallCount = 0; // reset after SSR
    await hydrate();

    // fn runs on client for reactivity setup
    expect(fnCallCount).toBe(1);
    // Template content is preserved (not re-rendered)
    expect(document.body.innerHTML).toContain('Loaded');
  });
});

describe('async client: hydrate pending (fallback mode)', () => {
  beforeEach(() => {
    applyGlobals();
    clearDirectives();
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    resetHydration();
    cleanupGlobals();
  });

  it('should swap fallback for template after client loads', async () => {
    const asyncFn: Directive = async ($scope: Record<string, unknown>) => {
      $scope.loaded = true;
    };
    asyncFn.$inject = ['$scope'];

    directive('pending-widget', asyncFn, {
      scope: true,
      template: '<div class="real">Real content</div>',
      fallback: '<div class="spinner">Loading...</div>',
      ssr: 'fallback',
    });

    // SSR renders fallback
    const ssrHtml = await render('<pending-widget></pending-widget>', {}, new Map());
    expect(ssrHtml).toContain('Loading...');
    expect(ssrHtml).toContain('data-g-async="pending"');

    // Client hydrates and swaps
    document.body.innerHTML = ssrHtml;
    await hydrate();

    expect(document.body.innerHTML).toContain('Real content');
    expect(document.body.innerHTML).not.toContain('Loading...');

    const widget = document.querySelector('pending-widget');
    expect(widget?.getAttribute('data-g-async')).toBe('loaded');
  });
});

describe('async client: pure client (no SSR)', () => {
  beforeEach(() => {
    applyGlobals();
    clearDirectives();
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    resetHydration();
    cleanupGlobals();
  });

  it('should show fallback then swap to template', async () => {
    const asyncFn: Directive = async ($scope: Record<string, unknown>) => {
      $scope.data = 'hello';
    };
    asyncFn.$inject = ['$scope'];

    directive('client-widget', asyncFn, {
      scope: true,
      template: '<div>Client loaded</div>',
      fallback: '<div>Client loading...</div>',
    });

    // No SSR - pure client
    document.body.innerHTML = '<client-widget></client-widget>';
    await hydrate();

    // After init, the template should be rendered
    expect(document.body.innerHTML).toContain('Client loaded');

    const widget = document.querySelector('client-widget');
    expect(widget?.getAttribute('data-g-async')).toBe('loaded');
  });
});

describe('async client: $fallback injectable', () => {
  beforeEach(() => {
    applyGlobals();
    clearDirectives();
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    resetHydration();
    cleanupGlobals();
  });

  it('should keep fallback when $fallback() is called on client', async () => {
    const asyncFn: Directive = async ($fallback: () => never) => {
      $fallback();
    };
    asyncFn.$inject = ['$fallback'];

    directive('fb-widget', asyncFn, {
      scope: true,
      template: '<div>Should not appear</div>',
      fallback: '<div>Fallback stays</div>',
    });

    document.body.innerHTML = '<fb-widget></fb-widget>';
    await hydrate();

    // Fallback should remain because $fallback() was called
    expect(document.body.innerHTML).toContain('Fallback stays');
    expect(document.body.innerHTML).not.toContain('Should not appear');
  });

  it('should mark element as error when async fn throws on client', async () => {
    const asyncFn: Directive = async () => {
      throw new Error('client load failed');
    };
    asyncFn.$inject = [];

    directive('error-widget', asyncFn, {
      scope: true,
      template: '<div>Loaded</div>',
      fallback: '<div>Error fallback</div>',
    });

    // SSR rendered fallback
    const ssrHtml = await render('<error-widget></error-widget>', {}, new Map(), undefined);
    document.body.innerHTML = '<error-widget data-g-async="pending"><div>Error fallback</div></error-widget>';
    await hydrate();

    const widget = document.querySelector('error-widget');
    expect(widget?.getAttribute('data-g-async')).toBe('error');
  });
});

describe('async client: pure client (no SSR)', () => {
  beforeEach(() => {
    applyGlobals();
    clearDirectives();
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    resetHydration();
    cleanupGlobals();
  });

  it('should show fallback then swap to template on success', async () => {
    let resolveAsync: () => void;
    const pending = new Promise<void>(r => { resolveAsync = r; });

    const asyncFn: Directive = async ($scope: Record<string, unknown>) => {
      await pending;
      $scope.loaded = true;
    };
    asyncFn.$inject = ['$scope'];

    directive('lazy-widget', asyncFn, {
      scope: true,
      fallback: '<p>Loading...</p>',
      template: '<div class="content">Done</div>',
    });

    document.body.innerHTML = '<lazy-widget></lazy-widget>';
    const hydratePromise = hydrate();

    // Allow microtasks to process so fallback renders
    await new Promise(r => setTimeout(r, 0));

    const widget = document.querySelector('lazy-widget')!;
    expect(widget.getAttribute('data-g-async')).toBe('pending');
    expect(widget.innerHTML).toContain('Loading...');

    resolveAsync!();
    await hydratePromise;

    expect(widget.getAttribute('data-g-async')).toBe('loaded');
    expect(widget.innerHTML).toContain('content');
  });

  it('should keep fallback when async directive throws', async () => {
    const asyncFn: Directive = async () => {
      throw new Error('network failure');
    };
    asyncFn.$inject = [];

    directive('fail-widget', asyncFn, {
      scope: true,
      fallback: '<p>Fallback</p>',
      template: '<div>Success</div>',
    });

    document.body.innerHTML = '<fail-widget></fail-widget>';
    await hydrate();

    const widget = document.querySelector('fail-widget')!;
    expect(widget.getAttribute('data-g-async')).toBe('error');
    expect(widget.innerHTML).toContain('Fallback');
  });
});
