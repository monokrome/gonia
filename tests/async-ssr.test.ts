import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '../src/server/render.js';
import { directive, clearDirectives, Directive } from '../src/types.js';
import { resetAsyncIdCounter } from '../src/async.js';

describe('async SSR: await mode', () => {
  beforeEach(() => {
    clearDirectives();
    resetAsyncIdCounter();
  });

  it('should run async fn and render template (default ssr mode)', async () => {
    const asyncFn: Directive = async ($scope: Record<string, unknown>) => {
      $scope.loaded = true;
    };
    asyncFn.$inject = ['$scope'];

    directive('async-widget', asyncFn, {
      scope: true,
      template: '<div class="widget">Loaded</div>',
      fallback: '<div class="spinner">Loading...</div>',
    });

    const result = await render('<async-widget></async-widget>', {}, new Map());

    expect(result).toContain('<div class="widget">Loaded</div>');
    expect(result).toContain('data-g-async="loaded"');
    expect(result).not.toContain('Loading...');
  });

  it('should render fallback on $fallback() call in await mode', async () => {
    const asyncFn: Directive = async ($fallback: () => void) => {
      $fallback();
    };
    asyncFn.$inject = ['$fallback'];

    directive('fallback-widget', asyncFn, {
      scope: true,
      template: '<div>Loaded</div>',
      fallback: '<div>Loading...</div>',
      ssr: 'await',
    });

    const result = await render('<fallback-widget></fallback-widget>', {}, new Map());

    expect(result).toContain('Loading...');
    expect(result).toContain('data-g-async="pending"');
    expect(result).not.toContain('Loaded');
  });

  it('should render fallback when async fn throws in await mode', async () => {
    const asyncFn: Directive = async () => {
      throw new Error('load failed');
    };
    asyncFn.$inject = [];

    directive('error-widget', asyncFn, {
      scope: true,
      template: '<div>Loaded</div>',
      fallback: '<div>Error fallback</div>',
      ssr: 'await',
    });

    const result = await render('<error-widget></error-widget>', {}, new Map());

    expect(result).toContain('Error fallback');
    expect(result).toContain('data-g-async="pending"');
  });

  it('should respect maxDepth and render fallback', async () => {
    const asyncFn: Directive = async ($scope: Record<string, unknown>) => {
      $scope.data = 'deep';
    };
    asyncFn.$inject = ['$scope'];

    directive('deep-widget', asyncFn, {
      scope: true,
      template: '<div>Deep content</div>',
      fallback: '<div>Too deep</div>',
      ssr: 'await',
    });

    const result = await render(
      '<deep-widget></deep-widget>',
      {},
      new Map(),
      { maxDepth: 0 }
    );

    expect(result).toContain('Too deep');
    expect(result).toContain('data-g-async="timeout"');
    expect(result).not.toContain('Deep content');
  });

  it('should respect timeout and render fallback', async () => {
    const asyncFn: Directive = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    };
    asyncFn.$inject = [];

    directive('slow-widget', asyncFn, {
      scope: true,
      template: '<div>Slow content</div>',
      fallback: '<div>Timed out</div>',
      ssr: 'await',
    });

    const result = await render(
      '<slow-widget></slow-widget>',
      {},
      new Map(),
      { timeout: 1 }
    );

    expect(result).toContain('Timed out');
    expect(result).toContain('data-g-async="timeout"');
  });

  it('should not affect non-async directives', async () => {
    const syncFn: Directive = ($element: Element) => {
      ($element as HTMLElement).textContent = 'sync content';
    };
    syncFn.$inject = ['$element'];

    directive('sync-widget', syncFn, {
      scope: true,
      template: '<div>Template</div>',
    });

    const result = await render('<sync-widget></sync-widget>', {}, new Map());

    expect(result).toContain('<div>Template</div>');
    expect(result).not.toContain('data-g-async');
  });
});

describe('async SSR: fallback mode', () => {
  beforeEach(() => {
    clearDirectives();
    resetAsyncIdCounter();
  });

  it('should render fallback without running fn', async () => {
    let fnRan = false;
    const asyncFn: Directive = async () => {
      fnRan = true;
    };
    asyncFn.$inject = [];

    directive('lazy-widget', asyncFn, {
      scope: true,
      template: '<div>Loaded</div>',
      fallback: '<div class="spinner">Loading...</div>',
      ssr: 'fallback',
    });

    const result = await render('<lazy-widget></lazy-widget>', {}, new Map());

    expect(fnRan).toBe(false);
    expect(result).toContain('Loading...');
    expect(result).toContain('data-g-async="pending"');
    expect(result).not.toContain('Loaded');
  });

  it('should support function fallbacks', async () => {
    const asyncFn: Directive = async () => {};
    asyncFn.$inject = [];

    directive('fn-fallback', asyncFn, {
      scope: true,
      template: '<div>Loaded</div>',
      fallback: (attrs) => `<div>Loading ${attrs.title ?? 'unknown'}...</div>`,
      ssr: 'fallback',
    });

    const result = await render(
      '<fn-fallback title="Widget"></fn-fallback>',
      {},
      new Map()
    );

    expect(result).toContain('Loading Widget...');
    expect(result).toContain('data-g-async="pending"');
  });
});

describe('async SSR: stream mode', () => {
  beforeEach(() => {
    clearDirectives();
    resetAsyncIdCounter();
  });

  it('should render fallback with streaming attributes', async () => {
    const asyncFn: Directive = async () => {};
    asyncFn.$inject = [];

    directive('stream-widget', asyncFn, {
      scope: true,
      template: '<div>Streamed</div>',
      fallback: '<div>Loading...</div>',
      ssr: 'stream',
    });

    const pending: unknown[] = [];
    const result = await render(
      '<stream-widget></stream-widget>',
      {},
      new Map(),
      undefined,
      pending as never[]
    );

    expect(result).toContain('Loading...');
    expect(result).toContain('data-g-async="streaming"');
    expect(result).toContain('data-g-async-id="g-async-0"');
    expect(pending.length).toBe(1);
  });
});
