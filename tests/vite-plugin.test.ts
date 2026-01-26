/**
 * Tests for the Vite plugin.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gonia } from '../src/vite/plugin.js';

describe('gonia vite plugin', () => {
  // Helper to call transform on the plugin
  function transform(code: string, id: string = 'test.ts', options = {}) {
    const plugin = gonia(options);

    // Call configResolved to set isDev
    if (typeof plugin.configResolved === 'function') {
      plugin.configResolved({ command: 'build' } as any);
    }

    const result = (plugin.transform as any).call({}, code, id);
    return result?.code ?? null;
  }

  describe('directive auto-detection', () => {
    it('should detect g-text in template literal', () => {
      const code = 'const html = `<div g-text="message"></div>`;';
      const result = transform(code);

      expect(result).toContain("import { text } from 'gonia/directives'");
    });

    it('should detect g-for in template literal', () => {
      const code = 'const html = `<li g-for="item in items"></li>`;';
      const result = transform(code);

      expect(result).toContain("import { cfor } from 'gonia/directives'");
    });

    it('should detect g-if in template literal', () => {
      const code = 'const html = `<div g-if="visible"></div>`;';
      const result = transform(code);

      expect(result).toContain("import { cif } from 'gonia/directives'");
    });

    it('should detect g-show in template literal', () => {
      const code = 'const html = `<div g-show="visible"></div>`;';
      const result = transform(code);

      expect(result).toContain("import { show } from 'gonia/directives'");
    });

    it('should detect g-class in template literal', () => {
      const code = 'const html = `<div g-class="{ active: isActive }"></div>`;';
      const result = transform(code);

      expect(result).toContain("import { cclass } from 'gonia/directives'");
    });

    it('should detect g-model in template literal', () => {
      const code = 'const html = `<input g-model="name">`;';
      const result = transform(code);

      expect(result).toContain("import { model } from 'gonia/directives'");
    });

    it('should detect g-on in template literal', () => {
      const code = 'const html = `<button g-on="click: handleClick"></button>`;';
      const result = transform(code);

      expect(result).toContain("import { on } from 'gonia/directives'");
    });

    it('should detect g-html in template literal', () => {
      const code = 'const html = `<div g-html="content"></div>`;';
      const result = transform(code);

      expect(result).toContain("import { html } from 'gonia/directives'");
    });

    it('should detect multiple directives', () => {
      const code = 'const html = `<div g-text="msg" g-show="visible" g-class="{ active: true }"></div>`;';
      const result = transform(code);

      expect(result).toContain('text');
      expect(result).toContain('show');
      expect(result).toContain('cclass');
    });

    it('should detect directives in string literals', () => {
      const code = 'const html = "<div g-text=\\"message\\"></div>";';
      const result = transform(code);

      expect(result).toContain("import { text } from 'gonia/directives'");
    });

    it('should not duplicate imports if already present', () => {
      const code = `
        import { text } from 'gonia/directives';
        const html = \`<div g-text="message"></div>\`;
      `;
      const result = transform(code);

      // Should not add another import
      expect(result).toBeNull();
    });
  });

  describe('dynamic directive resolution', () => {
    it('should resolve string literal in template expression', () => {
      const code = 'const attr = `g-${\'text\'}`; const html = `<div ${attr}="msg"></div>`;';
      const result = transform(code);

      expect(result).toContain("import { text } from 'gonia/directives'");
    });

    it('should resolve variable to string literal', () => {
      const code = `
        const name = 'show';
        const attr = \`g-\${name}\`;
      `;
      const result = transform(code);

      expect(result).toContain("import { show } from 'gonia/directives'");
    });

    it('should resolve const variable', () => {
      const code = `
        const directiveName = 'for';
        const attr = \`g-\${directiveName}\`;
      `;
      const result = transform(code);

      expect(result).toContain("import { cfor } from 'gonia/directives'");
    });
  });

  describe('includeDirectives option', () => {
    it('should include specified directives', () => {
      const code = 'const x = 1;'; // No directives in code
      const result = transform(code, 'test.ts', {
        includeDirectives: ['g-text', 'g-for']
      });

      expect(result).toContain("import { text, cfor } from 'gonia/directives'");
    });

    it('should add to auto-detected directives', () => {
      const code = 'const html = `<div g-show="visible"></div>`;';
      const result = transform(code, 'test.ts', {
        includeDirectives: ['g-text']
      });

      expect(result).toContain('show');
      expect(result).toContain('text');
    });
  });

  describe('excludeDirectives option', () => {
    it('should exclude specified directives', () => {
      const code = 'const html = `<div g-text="msg" g-show="visible"></div>`;';
      const result = transform(code, 'test.ts', {
        excludeDirectives: ['g-show']
      });

      // Import should contain text but not show
      const importLine = result?.split('\n')[0] ?? '';
      expect(importLine).toContain('text');
      expect(importLine).not.toContain('show');
    });

    it('should exclude from includeDirectives too', () => {
      const code = 'const x = 1;';
      const result = transform(code, 'test.ts', {
        includeDirectives: ['g-text', 'g-show'],
        excludeDirectives: ['g-show']
      });

      expect(result).toContain('text');
      expect(result).not.toContain('show');
    });
  });

  describe('autoDirectives option', () => {
    it('should disable auto-detection when false', () => {
      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(code, 'test.ts', {
        autoDirectives: false
      });

      expect(result).toBeNull();
    });

    it('should still allow includeDirectives when autoDirectives is false', () => {
      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(code, 'test.ts', {
        autoDirectives: false,
        includeDirectives: ['g-for']
      });

      // Should not detect g-text but should include g-for
      expect(result).toContain('cfor');
      expect(result).not.toContain("'text'");
    });
  });

  describe('$inject transformation', () => {
    it('should add $inject to directive functions', () => {
      const code = `
        import { directive } from 'gonia';

        const myDirective = ($element, $state) => {
          $state.count = 0;
        };

        directive('my-app', myDirective, { scope: true });
      `;
      const result = transform(code);

      expect(result).toContain('myDirective.$inject = ["$element","$state"]');
    });

    it('should not add $inject if already present', () => {
      const code = `
        import { directive } from 'gonia';

        const myDirective = ($element, $state) => {};
        myDirective.$inject = ['$element', '$state'];

        directive('my-app', myDirective);
      `;
      const result = transform(code);

      // Should not transform - $inject already exists
      // The result is null because no transformation was needed
      if (result !== null) {
        // If it did transform (for directive detection), check no duplicate $inject
        const matches = result.match(/\$inject/g) ?? [];
        expect(matches.length).toBe(1);
      }
    });
  });

  describe('file filtering', () => {
    it('should skip non-JS/TS files', () => {
      const code = '<div g-text="msg"></div>';
      const result = transform(code, 'test.css');

      expect(result).toBeNull();
    });

    it('should process .ts files', () => {
      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(code, 'app.ts');

      expect(result).toContain('text');
    });

    it('should process .tsx files', () => {
      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(code, 'app.tsx');

      expect(result).toContain('text');
    });

    it('should process .js files', () => {
      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(code, 'app.js');

      expect(result).toContain('text');
    });

    it('should process .html files', () => {
      const code = '<div g-text="msg"></div>';
      const result = transform(code, 'index.html');

      expect(result).toContain('text');
    });

    it('should skip node_modules', () => {
      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(code, 'node_modules/some-lib/index.ts');

      expect(result).toBeNull();
    });
  });

  describe('directiveAttributePrefixes option', () => {
    it('should use custom attribute prefixes', () => {
      const code = 'const html = `<div v-text="msg"></div>`;';
      const result = transform(code, 'test.ts', {
        directiveAttributePrefixes: ['v-']
      });

      // v-text is not a built-in, so no import generated
      // but the directive is detected
      expect(result).toBeNull();
    });

    it('should support multiple prefixes', () => {
      const code = 'const html = `<div g-text="msg" x-show="visible"></div>`;';
      const result = transform(code, 'test.ts', {
        directiveAttributePrefixes: ['g-', 'x-']
      });

      // g-text is built-in, x-show is not
      expect(result).toContain('text');
    });
  });

  describe('directiveElementPrefixes option', () => {
    it('should detect element directives with prefix', () => {
      const code = 'const html = `<app-header></app-header>`;';
      const result = transform(code, 'test.ts', {
        directiveElementPrefixes: ['app-']
      });

      // app-header is not a built-in, so null (no import to generate)
      // but if it were in directiveSources, it would be imported
      expect(result).toBeNull();
    });

    it('should default to attribute prefixes', () => {
      const code = 'const html = `<g-custom></g-custom>`;';
      const result = transform(code, 'test.ts', {
        directiveAttributePrefixes: ['g-']
        // directiveElementPrefixes defaults to ['g-']
      });

      // g-custom element detected but not a built-in
      expect(result).toBeNull();
    });
  });

  describe('directiveOptions', () => {
    it('should generate configureDirective call for object form', () => {
      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(code, 'test.ts', {
        directiveOptions: {
          'g-text': { scope: true }
        }
      });

      expect(result).toContain("import { text } from 'gonia/directives'");
      expect(result).toContain("import { configureDirective } from 'gonia'");
      expect(result).toContain("configureDirective('g-text', { scope: true })");
    });

    it('should generate configureDirective call for function form', () => {
      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(code, 'test.ts', {
        directiveOptions: (name) => name === 'g-text' ? { scope: true } : undefined
      });

      expect(result).toContain("configureDirective('g-text', { scope: true })");
    });

    it('should serialize template strings', () => {
      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(code, 'test.ts', {
        directiveOptions: {
          'g-text': { template: '<span><slot></slot></span>' }
        }
      });

      expect(result).toContain('template: "<span><slot></slot></span>"');
    });

    it('should handle multiple directives with options', () => {
      const code = 'const html = `<div g-text="msg" g-show="visible"></div>`;';
      const result = transform(code, 'test.ts', {
        directiveOptions: {
          'g-text': { scope: true },
          'g-show': { scope: true }
        }
      });

      expect(result).toContain("configureDirective('g-text', { scope: true })");
      expect(result).toContain("configureDirective('g-show', { scope: true })");
    });

    it('should only configure directives that have options', () => {
      const code = 'const html = `<div g-text="msg" g-show="visible"></div>`;';
      const result = transform(code, 'test.ts', {
        directiveOptions: {
          'g-text': { scope: true }
          // g-show has no options
        }
      });

      expect(result).toContain("configureDirective('g-text'");
      expect(result).not.toContain("configureDirective('g-show'");
    });

    it('should work with function returning undefined', () => {
      const code = 'const html = `<div g-text="msg" g-show="visible"></div>`;';
      const result = transform(code, 'test.ts', {
        directiveOptions: (name) => name.startsWith('g-t') ? { scope: true } : undefined
      });

      expect(result).toContain("configureDirective('g-text'");
      expect(result).not.toContain("configureDirective('g-show'");
    });
  });

  describe('plugin metadata', () => {
    it('should have correct name', () => {
      const plugin = gonia();
      expect(plugin.name).toBe('gonia');
    });

    it('should enforce pre', () => {
      const plugin = gonia();
      expect(plugin.enforce).toBe('pre');
    });

    it('should configure SSR', () => {
      const plugin = gonia();
      const config = (plugin.config as any)({});

      expect(config.ssr.noExternal).toContain('gonia');
    });
  });
});
