import { describe, it, expect, beforeEach } from 'vitest';
import { directive, clearDirectives, Directive } from '../src/types.js';
import { resetAsyncIdCounter } from '../src/async.js';
import { renderStream } from '../src/server/stream.js';

async function collectStream(stream: ReadableStream<string>): Promise<string[]> {
  const reader = stream.getReader();
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return chunks;
}

describe('renderStream', () => {
  beforeEach(() => {
    clearDirectives();
    resetAsyncIdCounter();
  });

  it('should stream initial HTML followed by replacement scripts', async () => {
    const asyncFn: Directive = async ($scope: Record<string, unknown>) => {
      $scope.data = 'resolved';
    };
    asyncFn.$inject = ['$scope'];

    directive('stream-widget', asyncFn, {
      scope: true,
      template: '<div class="content">Streamed content</div>',
      fallback: '<div class="spinner">Loading...</div>',
      ssr: 'stream',
    });

    const stream = renderStream(
      '<stream-widget></stream-widget>',
      {},
      new Map()
    );

    const chunks = await collectStream(stream);

    // First chunk is the initial HTML with fallback
    expect(chunks[0]).toContain('Loading...');
    expect(chunks[0]).toContain('data-g-async="streaming"');
    expect(chunks[0]).toContain('data-g-async-id="g-async-0"');

    // Second chunk is the replacement script
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[1]).toContain('<script>');
    expect(chunks[1]).toContain('Streamed content');
    expect(chunks[1]).toContain('data-g-async-id="g-async-0"');
    expect(chunks[1]).toContain('__gonia_hydrate');
  });

  it('should handle multiple streaming directives', async () => {
    const asyncFn1: Directive = async ($scope: Record<string, unknown>) => {
      $scope.a = 1;
    };
    asyncFn1.$inject = ['$scope'];

    const asyncFn2: Directive = async ($scope: Record<string, unknown>) => {
      $scope.b = 2;
    };
    asyncFn2.$inject = ['$scope'];

    directive('stream-a', asyncFn1, {
      scope: true,
      template: '<div>Widget A</div>',
      fallback: '<div>Loading A...</div>',
      ssr: 'stream',
    });

    directive('stream-b', asyncFn2, {
      scope: true,
      template: '<div>Widget B</div>',
      fallback: '<div>Loading B...</div>',
      ssr: 'stream',
    });

    const stream = renderStream(
      '<stream-a></stream-a><stream-b></stream-b>',
      {},
      new Map()
    );

    const chunks = await collectStream(stream);

    // Initial HTML with both fallbacks
    expect(chunks[0]).toContain('Loading A...');
    expect(chunks[0]).toContain('Loading B...');
    expect(chunks[0]).toContain('data-g-async-id="g-async-0"');
    expect(chunks[0]).toContain('data-g-async-id="g-async-1"');

    // Two replacement scripts
    expect(chunks.length).toBe(3);
    expect(chunks[1]).toContain('Widget A');
    expect(chunks[2]).toContain('Widget B');
  });

  it('should skip streaming chunk when $fallback() is called', async () => {
    const asyncFn: Directive = async ($fallback: () => never) => {
      $fallback();
    };
    asyncFn.$inject = ['$fallback'];

    directive('fb-stream', asyncFn, {
      scope: true,
      template: '<div>Should not stream</div>',
      fallback: '<div>Fallback stays</div>',
      ssr: 'stream',
    });

    const stream = renderStream(
      '<fb-stream></fb-stream>',
      {},
      new Map()
    );

    const chunks = await collectStream(stream);

    // Only initial HTML, no replacement script
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('Fallback stays');
  });

  it('should handle non-async directives normally', async () => {
    const syncFn: Directive = ($element: Element) => {
      ($element as HTMLElement).textContent = 'sync';
    };
    syncFn.$inject = ['$element'];

    directive('sync-el', syncFn, {
      scope: true,
      template: '<div>Sync template</div>',
    });

    const stream = renderStream(
      '<sync-el></sync-el>',
      {},
      new Map()
    );

    const chunks = await collectStream(stream);

    // Only initial HTML, no streaming needed
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('Sync template');
    expect(chunks[0]).not.toContain('data-g-async');
  });
});
