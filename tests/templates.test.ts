import { describe, it, expect, afterEach } from 'vitest';
import { Window } from 'happy-dom';
import {
  createTemplateRegistry,
  createMemoryRegistry,
  createServerRegistry
} from '../src/templates.js';

describe('createMemoryRegistry', () => {
  it('should return templates by name', async () => {
    const templates = createMemoryRegistry({
      card: '<div class="card">Card</div>',
      dialog: '<div class="dialog">Dialog</div>'
    });

    expect(await templates.get('card')).toBe('<div class="card">Card</div>');
    expect(await templates.get('dialog')).toBe('<div class="dialog">Dialog</div>');
  });

  it('should throw for missing templates', async () => {
    const templates = createMemoryRegistry({});

    await expect(templates.get('missing')).rejects.toThrow('Template not found: missing');
  });
});

describe('createServerRegistry', () => {
  it('should read templates from filesystem', async () => {
    const mockReadFile = async (path: string) => {
      if (path === './templates/card.html') {
        return '<div class="card">Card</div>';
      }
      throw new Error(`File not found: ${path}`);
    };

    const templates = createServerRegistry(mockReadFile, './templates/');

    expect(await templates.get('card')).toBe('<div class="card">Card</div>');
  });

  it('should cache results', async () => {
    let callCount = 0;
    const mockReadFile = async () => {
      callCount++;
      return '<div>Template</div>';
    };

    const templates = createServerRegistry(mockReadFile, './templates/');

    await templates.get('test');
    await templates.get('test');
    await templates.get('test');

    expect(callCount).toBe(1); // Only called once due to caching
  });
});

describe('createTemplateRegistry', () => {
  afterEach(() => {
    // Clean up global document mock
    delete (globalThis as any).document;
    delete (globalThis as any).HTMLTemplateElement;
  });

  it('should find inline template elements first', async () => {
    const window = new Window();
    window.document.body.innerHTML = '<template id="card"><div class="card">Inline</div></template>';

    // Mock globals
    (globalThis as any).document = window.document;
    (globalThis as any).HTMLTemplateElement = window.HTMLTemplateElement;

    const mockFetch = async () => {
      throw new Error('Should not fetch');
    };

    const templates = createTemplateRegistry({ fetch: mockFetch });
    const html = await templates.get('card');

    expect(html).toBe('<div class="card">Inline</div>');
  });

  it('should fall back to fetch when no inline template', async () => {
    const window = new Window();

    (globalThis as any).document = window.document;
    (globalThis as any).HTMLTemplateElement = window.HTMLTemplateElement;

    const mockFetch = async () => ({
      ok: true,
      text: async () => '<div>Fetched</div>'
    }) as Response;

    const templates = createTemplateRegistry({ fetch: mockFetch });
    const html = await templates.get('missing');

    expect(html).toBe('<div>Fetched</div>');
  });

  it('should fall back to fetch when element is not a template', async () => {
    const window = new Window();
    window.document.body.innerHTML = '<div id="card">Not a template</div>';

    (globalThis as any).document = window.document;
    (globalThis as any).HTMLTemplateElement = window.HTMLTemplateElement;

    const mockFetch = async () => ({
      ok: true,
      text: async () => '<div>Fetched</div>'
    }) as Response;

    const templates = createTemplateRegistry({ fetch: mockFetch });
    const html = await templates.get('card');

    expect(html).toBe('<div>Fetched</div>');
  });

  it('should cache fetched templates', async () => {
    let fetchCount = 0;
    const mockFetch = async () => {
      fetchCount++;
      return {
        ok: true,
        text: async () => '<div>Fetched</div>'
      } as Response;
    };

    const templates = createTemplateRegistry({ fetch: mockFetch });

    await templates.get('test');
    await templates.get('test');
    await templates.get('test');

    expect(fetchCount).toBe(1);
  });

  it('should throw on fetch failure', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    }) as Response;

    const templates = createTemplateRegistry({ fetch: mockFetch });

    await expect(templates.get('missing')).rejects.toThrow('Template not found: missing (404)');
  });

  it('should use custom base path', async () => {
    let requestedUrl = '';
    const mockFetch = async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        text: async () => '<div>Template</div>'
      } as Response;
    };

    const templates = createTemplateRegistry({
      fetch: mockFetch,
      basePath: '/components/'
    });

    await templates.get('card');

    expect(requestedUrl).toBe('/components/card');
  });
});
